import importlib.util
from pathlib import Path
import re
import unittest


PATCHER_PATH = Path(__file__).with_name("patch_torchmcubes_cxx20.py")
if not PATCHER_PATH.is_file():
    raise AssertionError("The worker must provide its torchmcubes C++20 patcher.")
spec = importlib.util.spec_from_file_location("patch_torchmcubes_cxx20", PATCHER_PATH)
if spec is None or spec.loader is None:
    raise AssertionError("The worker must provide its torchmcubes C++20 patcher.")
patcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patcher)


class TorchmcubesCxx20PatchTests(unittest.TestCase):
    def test_worker_fetches_the_patcher_from_an_immutable_commit(self):
        worker = PATCHER_PATH.with_name("run-job.sh").read_text(encoding="utf-8")
        match = re.search(r'^PATCHER_URL="([^"]+)"$', worker, re.MULTILINE)

        self.assertIsNotNone(match)
        self.assertRegex(
            match.group(1),
            r"^https://raw\.githubusercontent\.com/Yanzsmartwood2025/editor-visual-frontend/[0-9a-f]{40}/gpu-workers/triposr/patch_torchmcubes_cxx20\.py$",
        )

    def test_renames_the_four_conflicting_lerp_overloads(self):
        source = "\n".join(
            f"inline __device__ __host__ {kind} lerp({kind} a, {kind} b, float t) {{ return a; }}"
            for kind in ("float", "float2", "float3", "float4")
        )

        patched = patcher.patch_header(source)

        self.assertEqual(patched.count(" mc_lerp("), 4)
        self.assertNotIn(" lerp(", patched)
        self.assertEqual(patcher.patch_header(patched), patched)

    def test_refuses_a_partially_patched_header(self):
        with self.assertRaisesRegex(ValueError, "unrecognized torchmcubes helper_math.h"):
            patcher.patch_header(
                "inline __device__ __host__ float mc_lerp(float a, float b, float t) {}"
            )

    def test_refuses_an_unrecognized_upstream_header(self):
        with self.assertRaisesRegex(ValueError, "unrecognized torchmcubes helper_math.h"):
            patcher.patch_header("// upstream changed this file")

    def test_diagnostic_tail_redacts_bearer_tokens_and_signed_urls(self):
        sanitizer = getattr(patcher, "sanitize_diagnostic", None)
        self.assertTrue(callable(sanitizer), "The patcher must safely trim worker diagnostics.")

        diagnostic = sanitizer(
            "Authorization: Bearer secret-token\n"
            "download https://example.com/model?X-Amz-Signature=secret-signature\n"
            + "\n".join(f"compiler line {index}" for index in range(30))
        )

        self.assertNotIn("secret-token", diagnostic)
        self.assertNotIn("secret-signature", diagnostic)
        self.assertLessEqual(len(diagnostic), 1600)
        self.assertLessEqual(len(diagnostic.splitlines()), 18)


if __name__ == "__main__":
    unittest.main()
