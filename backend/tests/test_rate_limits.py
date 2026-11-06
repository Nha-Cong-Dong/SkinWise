"""In-memory rate limits forget keys (IPs, hashed emails) once their window has passed."""

from types import SimpleNamespace

import pytest

import app.accounts
from app.accounts import SWEEP_INTERVAL, RateLimit, sweep_rate_limits


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def monotonic(self) -> float:
        return self.now


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    clock = Clock()
    monkeypatch.setattr(app.accounts, "time", SimpleNamespace(monotonic=clock.monotonic))
    return clock


def test_a_key_that_never_returns_is_swept_by_other_traffic(clock: Clock) -> None:
    limit = RateLimit({"email": (3, 3600.0), "ip": (10, 3600.0)})
    limit.record("once@example.com", "203.0.113.7")
    assert len(limit) == 2
    clock.now += 3600 + SWEEP_INTERVAL
    limit.blocked("someone-else@example.com", None)  # any call sweeps when due
    assert len(limit) == 0


def test_keys_inside_their_window_are_kept(clock: Clock) -> None:
    limit = RateLimit({"email": (3, 3600.0), "ip": (10, 900.0)})
    limit.record("a@example.com", "203.0.113.7")
    clock.now += 1000  # past the IP window, inside the email window
    limit.sweep()
    assert len(limit) == 1  # the email key stays, the IP is gone
    clock.now += 2601
    limit.sweep()
    assert len(limit) == 0


def test_sweeping_does_not_change_what_is_blocked(clock: Clock) -> None:
    limit = RateLimit({"email": (2, 600.0)})
    limit.record("a@example.com", None)
    limit.record("a@example.com", None)
    clock.now += SWEEP_INTERVAL
    limit.sweep()
    assert limit.blocked("a@example.com", None)
    clock.now += 600
    assert not limit.blocked("a@example.com", None)


def test_periodic_sweep_reaches_every_limit_without_requests(clock: Clock) -> None:
    first = RateLimit({"email": (1, 60.0)})
    second = RateLimit({"email": (1, 60.0), "ip": (1, 60.0)})
    first.record("a@example.com", None)
    second.record("b@example.com", "198.51.100.1")
    clock.now += 61
    sweep_rate_limits()  # what app.main runs every SWEEP_INTERVAL
    assert len(first) == len(second) == 0


def test_the_longest_ip_window_is_one_hour() -> None:
    """The privacy policy states how long an IP may stay in memory: window + SWEEP_INTERVAL."""
    from app import blog, label_api

    limits = [app.accounts._email_requests, app.accounts._failed_logins, label_api._photos]
    limits += list(blog._limits.values()) + [label_api._server_day]
    ip_windows = [lim._limits["ip"][1] for lim in limits if "ip" in lim._limits]
    assert max(ip_windows) == 3600.0
    assert SWEEP_INTERVAL == 60.0
