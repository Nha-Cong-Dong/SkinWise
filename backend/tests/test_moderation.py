import unicodedata

import pytest

from app.moderation import auto_flags, status_after_edit, status_after_reports


@pytest.mark.parametrize(
    "text",
    [
        "Serum này trị mụn rất nhanh",
        "Dùng để điều trị nám",
        "Kem đặc trị thâm",
        "Chữa khỏi mụn sau 1 tuần",
        "Da khỏi hẳn mụn ẩn",
        "TRỊ MỤN hiệu quả",
    ],
)
def test_medical_claims_are_flagged(text: str) -> None:
    assert auto_flags(text) == ["medical_claim"]


@pytest.mark.parametrize(
    "text",
    [
        "Sản phẩm có giá trị dưỡng ẩm tốt",
        "Hộp quà trị giá 500 nghìn",
        "Tôi không quan tâm chính trị",
        "Da mình mềm hơn, ít bóng dầu hơn",
        "Niacinamide 10% dùng 2.5 tuần",
        "Mình sửa chữa lại routine",
    ],
)
def test_ordinary_words_are_not_flagged(text: str) -> None:
    assert auto_flags(text) == []


def test_decomposed_unicode_is_normalized() -> None:
    assert auto_flags(unicodedata.normalize("NFD", "trị mụn")) == ["medical_claim"]


@pytest.mark.parametrize(
    "text", ["Gọi 0912 345 678", "sdt 0912.345.678", "zalo +84912345678", "0912-345-678"]
)
def test_phone_numbers(text: str) -> None:
    assert auto_flags(text) == ["phone"]


def test_short_numbers_are_not_phones() -> None:
    assert auto_flags("Mình dùng 30 ngày, 2 lần mỗi ngày, giá 350000") == []


def test_email_and_links() -> None:
    assert auto_flags("liên hệ ban@example.com") == ["email"]
    assert auto_flags("xem https://shop.example") == ["link"]
    assert auto_flags("vào www.abc nhé") == ["link"]
    assert auto_flags("mua ở shopabc.vn") == ["link"]
    assert auto_flags("mua ở shopabc.com.vn hoặc gọi 0912345678") == ["phone", "link"]


def test_flags_come_in_a_fixed_order() -> None:
    assert auto_flags("trị mụn, gọi 0912345678, a@b.vn, http://x") == [
        "medical_claim",
        "phone",
        "email",
        "link",
    ]


def test_status_after_edit() -> None:
    assert status_after_edit("visible", ["link"]) == "pending"
    assert status_after_edit("visible", []) == "visible"
    assert status_after_edit("pending", []) == "visible"
    assert status_after_edit("hidden", []) == "hidden"
    assert status_after_edit("hidden", ["link"]) == "hidden"
    assert status_after_edit("removed", []) == "removed"


def test_status_after_reports() -> None:
    assert status_after_reports("visible", 2) == "visible"
    assert status_after_reports("visible", 3) == "hidden"
    assert status_after_reports("pending", 5) == "pending"


@pytest.mark.parametrize(
    "text",
    [
        "gel nay tri mun nhanh",
        "dung de dieu tri nam",
        "kem dac tri",
        "het, khoi mun",
    ],
)
def test_claims_without_diacritics(text: str) -> None:
    assert auto_flags(text) == ["medical_claim"]


@pytest.mark.parametrize(
    "text",
    [
        "co gia tri duong am",
        "hop qua tri gia 500k",
        "mun chua khoi han",
        "chưa khỏi hẳn mụn",
        "mình chưa mụn lại",
    ],
)
def test_unaccented_value_words_pass(text: str) -> None:
    flags = auto_flags(text)
    if text == "chưa khỏi hẳn mụn":  # accented "khỏi hẳn" is a claim
        assert flags == ["medical_claim"]
    else:
        assert flags == []


@pytest.mark.parametrize("text", ["(+84) 912 345 678", "(+84)912345678", "+84 912.345.678"])
def test_bracketed_country_code(text: str) -> None:
    assert auto_flags(text) == ["phone"]


def test_accented_chua_is_still_a_claim() -> None:
    assert auto_flags("Kem này chữa mụn") == ["medical_claim"]
