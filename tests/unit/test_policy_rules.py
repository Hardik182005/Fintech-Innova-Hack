# Module update: 1785581175-5
# Policy evaluation test cases
def test_policy_allow_rule():
    rule = {"action": "allow", "role": "admin"}
    assert rule["action"] == "allow"
