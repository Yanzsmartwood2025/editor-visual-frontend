"""CPU-only checks; never rent GPU or download model weights."""
import importlib.util
from pathlib import Path
import socket
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('wan_worker', Path(__file__).with_name('run-job.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class WorkerContractTests(unittest.TestCase):
    def test_valid_options(self):
        self.assertEqual(worker.validate_options({})['duration'], 3)
        self.assertEqual(worker.validate_options({'duration': 5, 'steps': 50})['steps'], 50)

    def test_unsupported_options(self):
        for value in ({'duration': 90}, {'duration': True}, {'steps': 31}, {'seed': -1},
                      {'guidance': float('nan')}, {'orientation': 'square'}, {'command': 'shell'},
                      {'negativePrompt': 'x' * 1001}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                worker.validate_options(value)

    def test_deadline(self):
        with self.assertRaises(TimeoutError):
            worker.remaining(time.time() - 1)

    def test_private_destination(self):
        for address in ('127.0.0.1', '10.0.0.1', '169.254.169.254', '::1'):
            with self.subTest(address=address), patch.object(socket, 'getaddrinfo', return_value=[(0, 0, 0, '', (address, 443))]), self.assertRaises(ValueError):
                worker.validate_public_url('https://image.example/photo.png')

    def test_protocol_and_credentials(self):
        for url in ('http://image.example/x', 'file:///tmp/x', 'https://user:secret@image.example/x'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                worker.validate_public_url(url)

    def test_public_destination(self):
        with patch.object(socket, 'getaddrinfo', return_value=[(0, 0, 0, '', ('1.1.1.1', 443))]):
            worker.validate_public_url('https://image.example/x')

class SessionTests(unittest.TestCase):
    def test_two_clips_reuse_one_pipeline(self):
        deadline = '2099-01-01T00:00:00Z'
        first = {'action': 'generate', 'generationId': 'a', 'jobId': 'job', 'deadline': deadline}
        second = {**first, 'generationId': 'b'}
        pipeline = object()
        with patch.object(worker, 'fetch_manifest', side_effect=[first, {'action': 'wait'}, second, {'action': 'stop'}]), patch.object(worker, 'load_pipeline', return_value=pipeline) as load, patch.object(worker, 'generate_clip') as clip, patch.object(worker, 'send_result') as result, patch.object(worker.signal, 'alarm'), patch.object(worker.signal, 'signal'), patch.object(worker.time, 'sleep'):
            worker.main('https://editor.example/manifest')
            load.assert_called_once()
            self.assertEqual(clip.call_count, 2)
            self.assertTrue(all(call.args[1] is pipeline for call in clip.call_args_list))
            self.assertEqual([call.args[0]['generationId'] for call in result.call_args_list], ['a', 'b'])

    def test_duplicate_generation_is_not_rendered_twice(self):
        first = {'action': 'generate', 'generationId': 'a', 'jobId': 'job', 'deadline': '2099-01-01T00:00:00Z'}
        with patch.object(worker, 'fetch_manifest', side_effect=[first, first, {'action': 'stop'}]), patch.object(worker, 'load_pipeline'), patch.object(worker, 'generate_clip') as clip, patch.object(worker, 'send_result'), patch.object(worker.signal, 'alarm'), patch.object(worker.signal, 'signal'), patch.object(worker.time, 'sleep'):
            worker.main('https://editor.example/manifest')
            clip.assert_called_once()

if __name__ == '__main__':
    unittest.main()
