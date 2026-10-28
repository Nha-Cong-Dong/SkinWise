"""Account emails over SMTP, with a fake SMTP server: no real email leaves the test."""

import logging
import smtplib
import uuid
from collections.abc import Iterator
from email.message import EmailMessage

import pytest
from fastapi.testclient import TestClient

from app import mailer
from app.accounts import POLICY_VERSION, reset_rate_limits
from app.accounts_api import RESET_SENT_VI, VERIFY_SENT_VI
from app.config import get_settings

PASSWORD = "mot cum tu de nho"
SMTP_SECRET = "smtp-app-password-123"


class FakeSMTP:
    """Records what a route sends instead of connecting anywhere."""

    instances: list["FakeSMTP"] = []
    fail: Exception | None = None

    def __init__(self, host: str, port: int, timeout: float | None = None, **kwargs) -> None:
        self.host, self.port, self.timeout, self.kwargs = host, port, timeout, kwargs
        self.tls = False
        self.logged_in: tuple[str, str] | None = None
        self.sent: list[EmailMessage] = []
        self.envelopes: list[list[str] | None] = []  # to_addrs of each send
        FakeSMTP.instances.append(self)

    def __enter__(self) -> "FakeSMTP":
        return self

    def __exit__(self, *exc) -> None:
        return None

    def starttls(self, context=None) -> None:
        self.tls = True

    def login(self, user: str, password: str) -> None:
        self.logged_in = (user, password)

    def send_message(self, message: EmailMessage, to_addrs: list[str] | None = None) -> None:
        if FakeSMTP.fail:
            raise FakeSMTP.fail
        self.sent.append(message)
        self.envelopes.append(to_addrs)


class FakeSMTPSSL(FakeSMTP):
    pass


@pytest.fixture(autouse=True)
def smtp(monkeypatch) -> Iterator[list[FakeSMTP]]:
    reset_rate_limits()
    FakeSMTP.instances = []
    FakeSMTP.fail = None
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTPSSL)
    settings = get_settings()
    for name, value in {
        "login_email_mode": "smtp",
        "smtp_host": "smtp.example.com",
        "smtp_port": 587,
        "smtp_username": "sender@example.com",
        "smtp_password": SMTP_SECRET,
        "smtp_from": "SkinWise <sender@example.com>",
        "smtp_security": "starttls",
    }.items():
        monkeypatch.setattr(settings, name, value)
    yield FakeSMTP.instances
    reset_rate_limits()


def new_email() -> str:
    return f"mail-{uuid.uuid4().hex[:8]}@example.com"


def register(client: TestClient, email: str):
    body = {"email": email, "password": PASSWORD, "consent": True, "policy_version": POLICY_VERSION}
    return client.post("/auth/register", json=body)


def sent_messages(instances: list[FakeSMTP]) -> list[EmailMessage]:
    return [m for smtp in instances for m in smtp.sent]


def link_in(message: EmailMessage, route: str) -> str:
    body = message.get_content()
    prefix = f"http://localhost:5173/#{route}?token="
    [line] = [line for line in body.splitlines() if line.startswith(prefix)]
    return line[len(prefix) :]


def test_verify_email_is_sent_and_its_link_works(client: TestClient, smtp) -> None:
    email = new_email()
    answer = register(client, email)
    assert answer.status_code == 202
    assert answer.json() == {"message_vi": VERIFY_SENT_VI, "dev_link": None}
    [connection] = smtp
    assert (connection.host, connection.port, connection.timeout) == ("smtp.example.com", 587, 15)
    assert connection.tls and connection.logged_in == ("sender@example.com", SMTP_SECRET)
    [message] = connection.sent
    assert message["Subject"] == "SkinWise: xác thực email của bạn"
    assert message["To"] == email and message["From"] == "SkinWise <sender@example.com>"
    assert connection.envelopes == [[email]]  # exactly one recipient, named explicitly
    body = message.get_content()
    assert "24 giờ" in body and "Nếu bạn không tạo tài khoản SkinWise" in body
    token = link_in(message, "verify-email")
    verified = client.post("/auth/verify-email", json={"token": token, "password": PASSWORD})
    assert verified.status_code == 200


def test_reset_email(client: TestClient, smtp) -> None:
    email = new_email()
    register(client, email)
    token = link_in(sent_messages(smtp)[0], "verify-email")
    client.post("/auth/verify-email", json={"token": token, "password": PASSWORD})
    answer = client.post("/auth/forgot-password", json={"email": email})
    assert answer.json() == {"message_vi": RESET_SENT_VI, "dev_link": None}
    message = sent_messages(smtp)[-1]
    assert message["Subject"] == "SkinWise: đặt lại mật khẩu"
    assert "30 phút" in message.get_content()
    reset = client.post(
        "/auth/reset-password",
        json={"token": link_in(message, "reset-password"), "password": "mat khau moi day"},
    )
    assert reset.status_code == 200


def test_account_exists_email_has_no_token(client: TestClient, smtp) -> None:
    email = new_email()
    register(client, email)
    token = link_in(sent_messages(smtp)[0], "verify-email")
    client.post("/auth/verify-email", json={"token": token, "password": PASSWORD})
    again = register(client, email)
    assert again.json() == {"message_vi": VERIFY_SENT_VI, "dev_link": None}  # as for a new one
    message = sent_messages(smtp)[-1]
    assert message["Subject"] == "SkinWise: email này đã có tài khoản"
    assert message["To"] == email
    body = message.get_content()
    assert "token" not in body and "Quên mật khẩu" in body and "http://localhost:5173/" in body


def test_nothing_sent_for_an_unknown_address(client: TestClient, smtp) -> None:
    assert client.post("/auth/forgot-password", json={"email": new_email()}).status_code == 202
    assert sent_messages(smtp) == []


def test_ssl_and_plain_connections(client: TestClient, smtp, monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_security", "ssl")
    monkeypatch.setattr(settings, "smtp_port", 465)
    register(client, new_email())
    assert isinstance(smtp[-1], FakeSMTPSSL) and smtp[-1].port == 465
    assert smtp[-1].kwargs.get("context") is not None

    monkeypatch.setattr(settings, "smtp_security", "none")
    monkeypatch.setattr(settings, "smtp_username", None)
    register(client, new_email())
    assert type(smtp[-1]) is FakeSMTP and not smtp[-1].tls and smtp[-1].logged_in is None
    assert len(smtp[-1].sent) == 1


@pytest.mark.parametrize("missing", ["smtp_host", "smtp_from"])
def test_smtp_without_host_or_sender_is_not_set_up(
    client: TestClient, smtp, monkeypatch, missing: str
) -> None:
    monkeypatch.setattr(get_settings(), missing, None)
    assert register(client, new_email()).status_code == 503
    assert client.post("/auth/forgot-password", json={"email": new_email()}).status_code == 503
    assert smtp == []


def test_a_failed_send_still_answers_and_logs_no_address(client: TestClient, smtp, caplog) -> None:
    email = new_email()
    FakeSMTP.fail = smtplib.SMTPRecipientsRefused({email: (550, b"no such user")})
    with caplog.at_level(logging.INFO, logger="skinwise.mail"):
        answer = register(client, email)
    assert answer.status_code == 202
    assert "Could not send the verify email: SMTPRecipientsRefused" in caplog.text
    assert email not in caplog.text
    assert "token=" not in caplog.text and SMTP_SECRET not in caplog.text


def test_me_reports_smtp_mode_as_not_dev(client: TestClient, smtp) -> None:
    assert mailer.dev_mode() is False
    email = new_email()
    register(client, email)
    token = link_in(sent_messages(smtp)[0], "verify-email")
    me = client.post("/auth/verify-email", json={"token": token, "password": PASSWORD})
    assert me.json()["dev_mode"] is False


@pytest.mark.parametrize(
    "address", ["x,qa@example.test", "x <qa@example.test>", "x;qa@example.test"]
)
def test_an_address_naming_several_recipients_is_refused(
    client: TestClient, smtp, address: str
) -> None:
    answer = register(client, address)
    assert answer.status_code == 422 and answer.json() == {"detail": "not an email address"}
    forgot = client.post("/auth/forgot-password", json={"email": address})
    assert forgot.status_code == 422
    assert smtp == []
