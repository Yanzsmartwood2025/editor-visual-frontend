import importlib.util
from pathlib import Path
import re
import unittest
import subprocess
import sys
import tempfile


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



    def test_diagnostic_keeps_compiler_errors_before_the_generic_ninja_tail(self):
        sanitizer = getattr(patcher, "sanitize_diagnostic", None)
        self.assertTrue(callable(sanitizer), "The patcher must safely trim worker diagnostics.")

        raw = "\n".join(
            ["compiler output"] * 12
            + ["grid_interp_cuda.cu:37:4: error: exact compiler failure"]
            + ["ninja: build stopped: subcommand failed"] * 20
        )

        diagnostic = sanitizer(raw)

        self.assertIn("grid_interp_cuda.cu:37:4: error: exact compiler failure", diagnostic)
        self.assertLessEqual(len(diagnostic), 1800)


    def test_worker_builds_cpu_mesh_extension_without_cuda_sources(self):
        worker = PATCHER_PATH.with_name("run-job.sh").read_text(encoding="utf-8")
        match = re.search(r"<<'CPU_BUILD'\n(.*?)\nCPU_BUILD", worker, re.DOTALL)
        self.assertIsNotNone(match, "Worker must configure the CPU mesh backend.")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "cxx").mkdir()
            fixture = "if (CMAKE_CUDA_COMPILER)\n  cuda_sources()\nendif()\n"
            (root / "CMakeLists.txt").write_text(fixture)
            (root / "cxx" / "CMakeLists.txt").write_text(fixture)
            subprocess.run([sys.executable, "-c", match.group(1), str(root)], check=True)
            for path in (root / "CMakeLists.txt", root / "cxx" / "CMakeLists.txt"):
                self.assertIn("if (FALSE)", path.read_text())
                self.assertNotIn("if (CMAKE_CUDA_COMPILER)", path.read_text())
        self.assertIn("assert not torchmcubes.HAS_CUDA", worker)
        self.assertIn("torchmcubes.marching_cubes", worker)
        self.assertIn("CMAKE_BUILD_PARALLEL_LEVEL=2", worker)

    def test_worker_fetches_the_current_diagnostic_patcher(self):
        worker = PATCHER_PATH.with_name("run-job.sh").read_text(encoding="utf-8")
        self.assertIn("/96239830bf4a545e645c4f2b709e0094a0e83792/gpu-workers/triposr/patch_torchmcubes_cxx20.py", worker)

if __name__ == "__main__":
    unittest.main()
