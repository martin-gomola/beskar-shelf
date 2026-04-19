"""Tests for beskar_tools.cli.fix_ebooks.

The auto-linearisation path is mocked so these tests stay offline and don't
need qpdf installed in the test environment. The real qpdf invocation is
covered by test_optimize_pdf.test_lossless_optimise_writes_linearised_output.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from beskar_tools.cli import fix_ebooks as fe


def _make_files(author_dir: Path, names: list[str]) -> None:
    """Create empty placeholder files (we only assert paths, not bytes)."""

    author_dir.mkdir(parents=True, exist_ok=True)
    for name in names:
        (author_dir / name).write_bytes(b"")


def _stub_lineariser(monkeypatch: pytest.MonkeyPatch) -> list[Path]:
    """Replace the lineariser with a recorder. Returns the captured calls."""

    calls: list[Path] = []

    def fake(path: Path) -> tuple[bool, str | None]:
        calls.append(path)
        return True, None

    monkeypatch.setattr(fe, "linearise_in_place_quiet", fake)
    return calls


def test_moves_flat_files_into_per_book_subdirs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    author = tmp_path / "Andrzej Sapkowski"
    _make_files(author, ["Zaklínač.epub", "Hraničář.mobi"])
    _stub_lineariser(monkeypatch)

    result = CliRunner().invoke(fe.main, [str(author)])

    assert result.exit_code == 0, result.output
    assert (author / "Zaklínač" / "Zaklínač.epub").is_file()
    assert (author / "Hraničář" / "Hraničář.mobi").is_file()
    # Top-level files were moved, so iterdir() shouldn't see them anymore.
    assert sorted(p.name for p in author.iterdir()) == ["Hraničář", "Zaklínač"]
    assert "Moved 2 file(s)" in result.output


def test_pdfs_are_linearised_in_place_after_move(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    author = tmp_path / "Frank Herbert"
    _make_files(author, ["Duna.pdf", "Mesiáš.epub"])
    calls = _stub_lineariser(monkeypatch)

    result = CliRunner().invoke(fe.main, [str(author)])

    assert result.exit_code == 0, result.output
    # Only the PDF triggers linearisation, and only after it was moved.
    assert calls == [author / "Duna" / "Duna.pdf"]
    assert "(linearised)" in result.output
    assert "Linearised 1 PDF(s)" in result.output


def test_no_linearise_flag_skips_qpdf(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    author = tmp_path / "Jules Verne"
    _make_files(author, ["Tajuplný ostrov.pdf"])
    calls = _stub_lineariser(monkeypatch)

    result = CliRunner().invoke(fe.main, [str(author), "--no-linearise"])

    assert result.exit_code == 0, result.output
    assert (author / "Tajuplný ostrov" / "Tajuplný ostrov.pdf").is_file()
    assert calls == []  # lineariser never invoked
    assert "(linearised)" not in result.output


def test_missing_qpdf_warns_once_and_continues(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    author = tmp_path / "H. P. Lovecraft"
    _make_files(author, ["Volání Cthulhu.pdf", "Hrůza v Dunwichi.pdf", "Sny.epub"])

    def fake_missing(_path: Path) -> tuple[bool, str | None]:
        return False, "qpdf not found on PATH"

    monkeypatch.setattr(fe, "linearise_in_place_quiet", fake_missing)

    result = CliRunner().invoke(fe.main, [str(author)])

    assert result.exit_code == 0, result.output
    # All files moved despite the missing tool.
    assert (author / "Volání Cthulhu" / "Volání Cthulhu.pdf").is_file()
    assert (author / "Hrůza v Dunwichi" / "Hrůza v Dunwichi.pdf").is_file()
    assert (author / "Sny" / "Sny.epub").is_file()
    # The "qpdf not on PATH" warning should appear exactly once even though
    # there are two PDFs - that's the whole point of caching skipped_qpdf_missing.
    assert result.output.count("qpdf not on PATH") == 1
    assert "(linearise skipped: qpdf missing)" in result.output


def test_per_file_linearise_failure_does_not_abort(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    author = tmp_path / "Stephen King"
    _make_files(author, ["Carrie.pdf", "Misery.epub"])

    def fake_fail(_path: Path) -> tuple[bool, str | None]:
        return False, "operation for an object stream attempted on direct object"

    monkeypatch.setattr(fe, "linearise_in_place_quiet", fake_fail)

    result = CliRunner().invoke(fe.main, [str(author)])

    assert result.exit_code == 0, result.output
    assert (author / "Carrie" / "Carrie.pdf").is_file()
    assert (author / "Misery" / "Misery.epub").is_file()
    assert "linearise failed" in result.output


def test_directories_are_left_alone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    author = tmp_path / "Andrzej Sapkowski"
    author.mkdir()
    # Pre-existing per-book dir from a prior run.
    (author / "Zaklínač").mkdir()
    (author / "Zaklínač" / "Zaklínač.epub").write_bytes(b"")
    # New flat file from a fresh upload.
    (author / "Krew elfów.pdf").write_bytes(b"")
    calls = _stub_lineariser(monkeypatch)

    result = CliRunner().invoke(fe.main, [str(author)])

    assert result.exit_code == 0, result.output
    # The pre-existing book dir wasn't touched.
    assert (author / "Zaklínač" / "Zaklínač.epub").is_file()
    # The new flat file was moved + linearised.
    assert (author / "Krew elfów" / "Krew elfów.pdf").is_file()
    assert calls == [author / "Krew elfów" / "Krew elfów.pdf"]
    assert "Moved 1 file(s)" in result.output
