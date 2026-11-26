"""Regression tests for English-first character defaults; no SAP runtime required."""
import unittest
from unittest.mock import patch

from py.companion_defaults import resolve_generic_system_prompt


class CharacterDefaultsTests(unittest.TestCase):
    def test_empty_prompt(self):
        self.assertEqual(resolve_generic_system_prompt("", "User", "Character"), "")

    def test_custom_text_and_placeholders(self):
        self.assertEqual(
            resolve_generic_system_prompt("Hello {{user}}, I am {{char}}.", "Alex", "Morgan"),
            "Hello Alex, I am Morgan.",
        )

    def test_explicit_non_english_user_text_survives(self):
        self.assertEqual(
            resolve_generic_system_prompt("Bonjour {{user}}", "Alex", "Morgan"),
            "Bonjour Alex",
        )

    def test_only_exact_legacy_template_is_suppressed(self):
        from hashlib import sha256
        example = "Original default prompt"
        digest = sha256(example.encode("utf-8")).hexdigest()
        with patch("py.companion_defaults._LEGACY_GENERIC_PROMPT_SHA256", digest):
            self.assertEqual(resolve_generic_system_prompt(example, "Alex", "Morgan"), "")
            self.assertEqual(
                resolve_generic_system_prompt(example + "!", "Alex", "Morgan"),
                example + "!",
            )


if __name__ == "__main__":
    unittest.main()
