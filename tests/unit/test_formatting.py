# Module update: 1785587568-8
# Unit tests for currency formatting
def test_currency_symbol_mapping():
    symbols = {"USD": "$", "EUR": "â‚¬", "GBP": "Â£", "INR": "â‚¹"}
    assert symbols["USD"] == "$"
    assert symbols["INR"] == "â‚¹"
