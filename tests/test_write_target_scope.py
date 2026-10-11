"""Positive scope tests without starting graphd or making network requests."""
from graphd.gd.schema import host_in_scope, payload_target_hosts, pick_write_eng


def rows():
    return [{"name": "A", "scope": "example.test"},
            {"name": "B", "scope": "other.test"}]


def test_explicit_eng_does_not_authorize_foreign_host():
    assert pick_write_eng("A", rows(), ["foreign.test"]) == ""
    assert pick_write_eng("A", rows(), ["other.test"]) == ""
    assert pick_write_eng("A", rows(), ["app.example.test"]) == "A"


def test_unique_active_also_checks_scope():
    assert pick_write_eng("", rows()[:1], ["foreign.test"]) == ""
    assert pick_write_eng("", rows()[:1], ["example.test"]) == "A"


def test_all_declared_hosts_must_match_one_scope():
    assert pick_write_eng("A", rows(), ["example.test", "other.test"]) == ""
    assert pick_write_eng("", rows(), ["example.test", "other.test"]) == ""
    assert pick_write_eng("", rows(), ["other.test"]) == "B"


def test_invalid_explicit_eng_is_not_silently_reattributed():
    assert pick_write_eng("missing", rows()[:1], ["example.test"]) == ""


def test_exclusions_and_domain_boundary():
    assert not host_in_scope("mail.example.test", "example.test,!mail.example.test")
    assert not host_in_scope("badexample.test", "example.test")
    assert host_in_scope("a.example.test.", "*.example.test")


def test_local_and_ip_scopes_are_not_skipped():
    assert host_in_scope("127.0.0.1", "127.0.0.1")
    assert not host_in_scope("127.0.0.1", "example.test")
    assert host_in_scope("192.0.2.12", "192.0.2.0/24")
    assert not host_in_scope("192.0.2.12", "192.0.2.0/24,!192.0.2.0/25")
    assert host_in_scope("::1", "::1")


def test_explicit_targets_separate_evidence_references():
    assert payload_target_hosts({"target_url": "https://example.test/x",
                                 "repro": "reference https://docs.other.test/info",
                                 "evidence_url": "https://references.test"}) == ["example.test"]


def test_legacy_prose_targets_are_checked_conservatively():
    assert payload_target_hosts({"repro": "curl https://example.test/x"}) == ["example.test"]
    assert payload_target_hosts({"url": "http://127.0.0.1/test"}) == ["127.0.0.1"]
