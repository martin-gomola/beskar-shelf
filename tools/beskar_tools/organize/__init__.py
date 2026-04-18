"""Filesystem layout + multi-part merge detection."""

from .layout import LayoutResult, write_book_layout
from .merge import MergePlanner

__all__ = ["LayoutResult", "MergePlanner", "write_book_layout"]
