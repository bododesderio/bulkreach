"""M2 verification: template engine + contact parser (CSV, Excel, paste)."""
from __future__ import annotations

import io

import pandas as pd

from app.services import template_engine as te
from app.services.parsers import contact_parser as cp


def test_template_engine() -> None:
    # Case-insensitive tags, personalisation
    out = te.render_sms("Dear {{First_Name}}, your balance is UGX {{Amount}}.",
                        {"first_name": "Grace", "amount": "450,000"})
    assert out == "Dear Grace, your balance is UGX 450,000."

    # HTML autoescape prevents XSS via merge tags (Section 13.3)
    html = te.render_email_body("Hello {{name}}", {"name": "<script>alert(1)</script>"})
    assert "<script>" not in html and "&lt;script&gt;" in html

    # extract + validate merge tags
    assert te.extract_merge_tags("{{a}} {{B}} {{a}}") == ["a", "b"]
    assert te.validate_template("{{first_name}} {{unknown}}", ["first_name"]) == ["unknown"]

    # GSM-7 vs Unicode length
    gsm = te.sms_length_info("Hello world")
    assert gsm.encoding == "GSM-7" and gsm.parts == 1
    uni = te.sms_length_info("Hello 😀")
    assert uni.encoding == "Unicode"
    long_gsm = te.sms_length_info("a" * 200)
    assert long_gsm.parts == 2
    print("  template engine: OK")


def test_phone_normalisation() -> None:
    assert cp.normalise_phone("0772123456") == "+256772123456"
    assert cp.normalise_phone("+256 772 123 456") == "+256772123456"
    assert cp.normalise_phone("256772123456") == "+256772123456"
    assert cp.normalise_phone("772123456") == "+256772123456"
    assert cp.normalise_phone("notaphone") is None
    assert cp.is_valid_email("Grace@Example.COM") == "grace@example.com"
    assert cp.is_valid_email("bad@") is None
    print("  phone/email normalisation: OK")


def test_csv_parsing_and_detection() -> None:
    csv_bytes = (
        "Name,Mobile,Email,Reference\n"
        "Grace Nakato,0772123456,grace@example.com,REF-00124\n"
        "John Doe,0700111222,john@example.com,REF-00125\n"
        "Dup,0772123456,grace@example.com,REF-XXX\n"   # duplicate phone
        "NoContact,,,REF-999\n"                          # no phone/email -> error
    ).encode()
    r = cp.parse_csv(csv_bytes)
    assert r.phone_column == "Mobile", r.phone_column
    assert r.email_column == "Email", r.email_column
    assert set(r.merge_columns) == {"Name", "Reference"}, r.merge_columns
    assert r.valid_contacts == 2, r.valid_contacts
    assert r.duplicate_count == 1, r.duplicate_count
    assert r.error_count == 1, r.error_count
    assert r.contacts[0]["phone"] == "+256772123456"
    assert r.contacts[0]["raw_data"]["Reference"] == "REF-00124"
    print("  CSV parse + column detection + dedup: OK")


def test_excel_parsing() -> None:
    df = pd.DataFrame({
        "phone": ["0772123456", "0700111222"],
        "first_name": ["Grace", "John"],
    })
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    r = cp.parse_excel(buf.getvalue())
    assert r.phone_column == "phone"
    assert r.merge_columns == ["first_name"]
    assert r.valid_contacts == 2
    print("  Excel parse: OK")


def test_paste_parsing() -> None:
    r = cp.parse_pasted("0772123456, 0700111222\ngrace@example.com\n0772123456\ngarbage")
    assert r.valid_contacts == 3  # 2 phones + 1 email
    assert r.duplicate_count == 1
    assert r.error_count == 1
    assert not r.merge_columns  # no headers -> personalisation unavailable
    print("  paste parse: OK")


if __name__ == "__main__":
    test_template_engine()
    test_phone_normalisation()
    test_csv_parsing_and_detection()
    test_excel_parsing()
    test_paste_parsing()
    print("OK — M2 template engine + contact parser verified")
