"""get-abs-token: interactive helper that exchanges credentials for an API token."""

from __future__ import annotations

import getpass
import sys

import click

from ..abs_client import ABSClient, ABSError
from ..config import load_config


@click.command(help="Prompt for ABS credentials and print an API token.")
@click.option("--url", "url_opt", help="Audiobookshelf URL (default: from .env ABS_URL).")
@click.option("--username", "username_opt", help="Username (default: from .env ABS_USERNAME).")
def main(url_opt: str | None, username_opt: str | None) -> int:
    config = load_config()

    url = url_opt or config.abs_url
    if not url:
        url = click.prompt("Audiobookshelf URL").strip()

    username = username_opt or config.abs_username
    if not username:
        username = click.prompt("Username").strip()

    # Passwords must not echo. getpass handles TTY vs. non-TTY fallbacks.
    password = getpass.getpass("Password: ")
    if not (url and username and password):
        click.echo("URL, username, and password are required.", err=True)
        return 1

    try:
        token = ABSClient.login(url, username, password)
    except ABSError as exc:
        click.echo(str(exc), err=True)
        return 1

    click.echo("")
    click.echo("API token:")
    click.echo(token)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
