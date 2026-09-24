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

if __name__ == '__main__':
    unittest.main()
