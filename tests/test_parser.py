"""Direct unit tests for the GL/CoA parser — no mocks, tests actual parsing logic."""

from backend.app.services.parser import parse_gl, parse_coa, detect_file_type


GL_CSV_BALANCED = (
    b"Account Number,Account Name,Period,Debit,Credit\n"
    b"1000,Cash,2025-Q1,100000,0\n"
    b"2000,Revenue,2025-Q1,0,100000\n"
)

GL_CSV_NET = (
    b"Acct No,Description,Date,Amount\n"
    b"1000,Cash,2025-Q1,50000\n"
    b"2000,Revenue,2025-Q1,-50000\n"
)

GL_CSV_MISSING_COLS = b"Name,Value\nFoo,123\nBar,456\n"

GL_CSV_UNBALANCED = (
    b"Account Number,Account Name,Period,Debit,Credit\n"
    b"1000,Cash,2025-Q1,100000,0\n"
    b"2000,Revenue,2025-Q1,0,90000\n"
)

COA_CSV = (
    b"Account Number,Account Name,Account Type,Level\n"
    b"1000,Cash,Asset,1\n"
    b"1100,AR,Asset,2\n"
    b"2000,AP,Liability,1\n"
)

COA_CSV_MINIMAL = b"Acct Num,Description\n1000,Cash\n2000,Revenue\n"


def test_parse_gl_balanced_csv():
    """Balanced GL with separate DR/CR columns — all validations pass."""
    result = parse_gl(GL_CSV_BALANCED, "gl_test.csv")
    assert result["rows"] == 2
    assert result["accounts"] == 2
    assert result["periods"] == 1
    assert result["format"] == "separate_dr_cr"

    validations = {v["check"]: v for v in result["validations"]}
    assert validations["Account numbers present"]["pass"] is True
    assert validations["Period column detected"]["pass"] is True
    assert validations["Debit/credit columns"]["pass"] is True
    assert validations["Debit/credit columns"]["detail"] == "Separate columns"
    assert validations["Trial balance nets to zero"]["pass"] is True
    assert "$0.00" in validations["Trial balance nets to zero"]["detail"]


def test_parse_gl_net_amount():
    """GL with net amount column — detected correctly."""
    result = parse_gl(GL_CSV_NET, "gl_net.csv")
    assert result["format"] == "net_amount"
    assert result["rows"] == 2

    validations = {v["check"]: v for v in result["validations"]}
    assert validations["Account numbers present"]["pass"] is True
    assert validations["Debit/credit columns"]["pass"] is True
    assert validations["Debit/credit columns"]["detail"] == "Net amount"
    assert validations["Trial balance nets to zero"]["pass"] is True


def test_parse_gl_missing_columns():
    """GL with no recognizable columns — all validations fail."""
    result = parse_gl(GL_CSV_MISSING_COLS, "bad.csv")
    assert result["format"] == "unknown"
    assert result["accounts"] == 0
    assert result["periods"] == 0

    validations = {v["check"]: v for v in result["validations"]}
    assert validations["Account numbers present"]["pass"] is False
    assert validations["Period column detected"]["pass"] is False
    assert validations["Debit/credit columns"]["pass"] is False
    assert validations["Trial balance nets to zero"]["pass"] is False


def test_parse_gl_unbalanced():
    """GL where DR != CR — trial balance check fails."""
    result = parse_gl(GL_CSV_UNBALANCED, "unbalanced.csv")
    validations = {v["check"]: v for v in result["validations"]}
    assert validations["Trial balance nets to zero"]["pass"] is False
    assert "$10,000.00" in validations["Trial balance nets to zero"]["detail"]


def test_parse_coa_full():
    """CoA with all expected columns — all validations pass."""
    result = parse_coa(COA_CSV, "coa_test.csv")
    assert result["rows"] == 3
    assert result["accounts"] == 3
    assert result["hierarchy_levels"] > 0

    validations = {v["check"]: v for v in result["validations"]}
    assert validations["Account numbers present"]["pass"] is True
    assert validations["Account names present"]["pass"] is True
    assert validations["Account type column"]["pass"] is True
    assert validations["Hierarchy detected"]["pass"] is True


def test_parse_coa_minimal():
    """CoA with only account number and name — missing type and hierarchy."""
    result = parse_coa(COA_CSV_MINIMAL, "coa_min.csv")
    assert result["accounts"] == 2

    validations = {v["check"]: v for v in result["validations"]}
    assert validations["Account numbers present"]["pass"] is True
    assert validations["Account type column"]["pass"] is False
    assert validations["Hierarchy detected"]["pass"] is False
    assert "Will derive from GL" in validations["Hierarchy detected"]["detail"]


def test_detect_file_type():
    """detect_file_type guesses gl vs coa from filename."""
    assert detect_file_type("gl_meridian.csv") == "gl"
    assert detect_file_type("general_ledger.xlsx") == "gl"
    assert detect_file_type("coa_cascadia.csv") == "coa"
    assert detect_file_type("chart_of_accounts.xlsx") == "coa"
    assert detect_file_type("data.csv") == "gl"  # default to gl


def test_parse_gl_columns_detected():
    """parse_gl returns detected column mapping."""
    result = parse_gl(GL_CSV_BALANCED, "gl.csv")
    cols = result["columns_detected"]
    assert cols["account_number"] == "Account Number"
    assert cols["account_name"] == "Account Name"
    assert cols["period"] == "Period"
    assert cols["debit"] == "Debit"
    assert cols["credit"] == "Credit"
