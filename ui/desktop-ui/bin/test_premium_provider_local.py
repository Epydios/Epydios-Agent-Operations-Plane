import importlib.util
import os
import pathlib
import sys
import tempfile
import unittest
from contextlib import contextmanager


PROVIDER_PATH = pathlib.Path(__file__).resolve().with_name("premium-provider-local.py")


def load_provider_module():
    spec = importlib.util.spec_from_file_location("premium_provider_local", str(PROVIDER_PATH))
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class PremiumProviderLocalTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_provider_module()

    @contextmanager
    def environ(self, **updates):
        sentinel = object()
        original = {}
        for key, value in updates.items():
            original[key] = os.environ.get(key, sentinel)
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        try:
            yield
        finally:
            for key, value in original.items():
                if value is sentinel:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_load_endpoint_config_from_env(self):
        with self.environ(
            EPYDIOS_PREMIUM_PROVIDER_REMOTE_BASE_URL="https://premium.example.test",
            EPYDIOS_PREMIUM_PROVIDER_REMOTE_AUTH_TOKEN="token-123",
            EPYDIOS_PREMIUM_PROVIDER_REMOTE_TIMEOUT_MS="2500",
            EPYDIOS_PREMIUM_PROVIDER_EXTRACTED_ROOT=None,
        ):
            config = self.mod.load_endpoint_config()
        self.assertEqual(config.base_url, "https://premium.example.test")
        self.assertEqual(config.auth_token, "token-123")
        self.assertEqual(config.source, "env:EPYDIOS_PREMIUM_PROVIDER_REMOTE_BASE_URL")
        self.assertEqual(config.timeout_seconds, 2.5)

    def test_load_endpoint_config_from_manifest(self):
        root = pathlib.Path(tempfile.mkdtemp(prefix="premium-provider-manifest."))
        manifest = root / "provider-endpoint.json"
        manifest.write_text(
            '{"baseUrl":"https://premium.manifest.test","authToken":"abc","timeoutMs":4000}',
            encoding="utf-8",
        )
        with self.environ(
            EPYDIOS_PREMIUM_PROVIDER_REMOTE_BASE_URL=None,
            EPYDIOS_PREMIUM_PROVIDER_EXTRACTED_ROOT=str(root),
        ):
            config = self.mod.load_endpoint_config()
        self.assertEqual(config.base_url, "https://premium.manifest.test")
        self.assertEqual(config.auth_token, "abc")
        self.assertEqual(config.timeout_seconds, 4.0)
        self.assertTrue(config.source.endswith("provider-endpoint.json"))

    def test_missing_endpoint_config_fails_clearly(self):
        root = pathlib.Path(tempfile.mkdtemp(prefix="premium-provider-empty."))
        with self.environ(
            EPYDIOS_PREMIUM_PROVIDER_REMOTE_BASE_URL=None,
            EPYDIOS_PREMIUM_PROVIDER_EXTRACTED_ROOT=str(root),
        ):
            with self.assertRaises(FileNotFoundError) as err:
                self.mod.load_endpoint_config()
        self.assertIn("provider-endpoint", str(err.exception))


if __name__ == "__main__":
    unittest.main()
