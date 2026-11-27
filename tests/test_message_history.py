import copy
import unittest
from pathlib import Path
import runpy

history = runpy.run_path(str(Path(__file__).resolve().parents[1] / "py/message_history.py"))
ContextHistoryError = history["ContextHistoryError"]
bounded_dialogue = history["bounded_dialogue"]
normalize_tool_history = history["normalize_tool_history"]
select_compressed_dialogue = history["select_compressed_dialogue"]


def user(text="question"):
    return {"role": "user", "content": text}


def assistant(text="answer", ids=()):
    msg = {"role": "assistant", "content": text}
    if ids:
        msg["tool_calls"] = [{"id": tid, "type": "function",
                              "function": {"name": "test", "arguments": "{}"}}
                             for tid in ids]
    return msg


def tool(tid, text="result"):
    return {"role": "tool", "tool_call_id": tid, "content": text}


class MessageHistoryTests(unittest.TestCase):
    def test_complete_parallel_batch_unchanged(self):
        messages = [user(), assistant("", ("a", "b")), tool("b"), tool("a")]
        original = copy.deepcopy(messages)
        self.assertEqual(normalize_tool_history(messages, protect_latest=True), original)
        self.assertEqual(messages, original)

    def test_historical_incomplete_and_nonadjacent_results(self):
        messages = [user(), assistant("partial text", ("a", "b")), tool("a"),
                    assistant(), tool("b"), user("new question")]
        original = copy.deepcopy(messages)
        self.assertEqual(normalize_tool_history(messages, protect_latest=True),
                         [messages[0], assistant("partial text"), messages[3], messages[5]])
        self.assertEqual(messages, original)

    def test_duplicate_unknown_results_and_malformed_ids(self):
        messages = [assistant("", ("a",)), tool("a"), tool("a", "duplicate"),
                    tool("unknown"), user()]
        self.assertEqual(normalize_tool_history(messages, protect_latest=True),
                         [messages[0], messages[1], messages[-1]])
        for ids in (("a", "a"), (None,), ([],)):
            malformed = [assistant("keep", ids), tool("a"), user()]
            self.assertEqual(normalize_tool_history(malformed, protect_latest=True),
                             [assistant("keep"), malformed[-1]])

    def test_active_malformed_batches_rejected(self):
        for messages in ([user(), assistant("", ("a", "b")), tool("a")],
                         [user(), tool("orphan")],
                         [user(), assistant("", ("a",)), tool("a"), tool("a")],
                         [user(), assistant("", ("a",)), assistant(), tool("a")]):
            with self.subTest(messages=messages), self.assertRaises(ContextHistoryError):
                normalize_tool_history(messages, protect_latest=True)

    def test_cut_never_restores_older_entries(self):
        messages = [user("old"), assistant("", ("a", "b")), tool("a"), tool("b"),
                    assistant(), user("new")]
        self.assertEqual(bounded_dialogue(messages, 4), messages[-2:])
        self.assertEqual(bounded_dialogue(messages, 5), messages[-5:])
        self.assertEqual(bounded_dialogue(messages, 2), messages[-2:])
        with self.assertRaises(ContextHistoryError):
            bounded_dialogue([user(), assistant("", ("a", "b")), tool("a"), tool("b")], 3)
        with self.assertRaises(ContextHistoryError):
            bounded_dialogue(messages, 0)

    def test_plain_dialogue_legacy_window_unchanged(self):
        messages = [user(str(i)) if i % 2 == 0 else assistant(str(i)) for i in range(31)]
        self.assertEqual(bounded_dialogue(messages, 12), messages[-12:])

    def test_round_compression_preserves_active_and_drops_partial_historical_batch(self):
        messages = [user("old"), assistant("old text", ("a", "b")), tool("a"), tool("b"),
                    assistant(), user("new"), assistant("", ("c", "d")), tool("c"), tool("d")]
        selected = select_compressed_dialogue(messages, {0, 1, 2, 4, 5, 8})
        self.assertEqual(selected, [messages[i] for i in (0, 1, 4, 5, 6, 7, 8)])
        self.assertEqual(normalize_tool_history(selected, protect_latest=True),
                         [messages[0], assistant("old text"), *messages[4:]])

    def test_diagnostics_are_content_free(self):
        with self.assertLogs("app", level="INFO") as logs:
            normalize_tool_history([tool("private ID", "private content"), user()])
        self.assertIn("discarded_results=1 invalid_batches=0", logs.output[0])
        self.assertNotIn("private", logs.output[0])


if __name__ == "__main__":
    unittest.main()
