# -*- coding: utf-8 -*-
"""ECOUNT 품목 동기화/검증 도구 (UTF-8 안전). curl 한글 깨짐 회피용."""
import json, urllib.request

BASE = "https://sboapiAC.ecount.com/OAPI/V2"
COM_CODE, USER_ID, ZONE = "631989", "ttong", "AC"

# 희망나르미 사회적협동조합 (공급받는자) — ECOUNT 거래처코드(하이픈 포함)
CUST_HOPE = "490-82-00102"

def load_env(path=".env"):
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env

def post(url, payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def login(key):
    d = post(f"{BASE}/OAPILogin", {
        "COM_CODE": COM_CODE, "USER_ID": USER_ID,
        "API_CERT_KEY": key, "LAN_TYPE": "ko-KR", "ZONE": ZONE})
    return d["Data"]["Datas"]["SESSION_ID"]

ZONES = [
    ("wsl_z1", "1급지", 2780), ("wsl_z2", "2급지", 2810),
    ("wsl_z3", "3급지", 3000), ("wsl_z4", "4급지", 3200),
    ("wsl_z5", "5급지", 3490), ("wsl_z6", "6급지", 3820),
    ("wsl_z7", "7급지", 4170),
]

def product_payload(code, zone, price):
    return {"BulkDatas": {
        "PROD_CD": code,
        "PROD_DES": f"정부양곡 운송비 {zone}",
        "SIZE_DES": "10kg",          # 규격
        "UNIT": "포",                # 단위
        "PROD_TYPE": "3",            # 상품
        "BAL_FLAG": "0",             # 재고수량관리 사용안함
        "OUT_PRICE": str(price),
        "OUT_PRICE_VAT": "1",        # 출고단가 VAT포함
        "VAT_YN": "Y",               # 과세
        "TAX": "10",
    }}

def verify_one(sid):
    """신규 코드 wsl_t1로 필드 반영 + 한글 전송을 검증한다."""
    r = post(f"{BASE}/InventoryBasic/SaveBasicProduct?SESSION_ID={sid}",
             {"ProductList": [product_payload("wsl_t1", "검증용", 2780)]})
    d = r.get("Data") or {}
    print("등록: 성공", d.get("SuccessCnt"), "/ 실패", d.get("FailCnt"))
    for x in (d.get("ResultDetails") or []):
        if not x.get("IsSuccess"):
            print("  실패:", x.get("TotalError"))
    chk = post(f"{BASE}/InventoryBasic/GetBasicProductsList?SESSION_ID={sid}", {})
    for p in chk["Data"]["Result"]:
        if p.get("PROD_CD") == "wsl_t1":
            keys = ["PROD_CD", "PROD_DES", "SIZE_DES", "UNIT",
                    "BAL_FLAG", "OUT_PRICE", "OUT_PRICE_VAT", "VAT_YN"]
            print("검증결과:", json.dumps({k: p.get(k) for k in keys}, ensure_ascii=False))
            return
    print("검증: wsl_t1 조회 안 됨")

def register_zones(sid):
    """급지별 품목 7개 신규 등록 (깨진 기존 7개를 화면에서 삭제한 뒤 실행)."""
    payload = {"ProductList": [product_payload(c, z, p) for c, z, p in ZONES]}
    r = post(f"{BASE}/InventoryBasic/SaveBasicProduct?SESSION_ID={sid}", payload)
    d = r.get("Data") or {}
    print("급지품목 등록: 성공", d.get("SuccessCnt"), "/ 실패", d.get("FailCnt"))
    for x in (d.get("ResultDetails") or []):
        if not x.get("IsSuccess"):
            print("  실패:", x.get("TotalError"))
    chk = post(f"{BASE}/InventoryBasic/GetBasicProductsList?SESSION_ID={sid}", {})
    print("--- 재등록 확인 ---")
    for p in chk["Data"]["Result"]:
        if str(p.get("PROD_CD", "")).startswith("wsl_z"):
            print(f"  {p['PROD_CD']} | {p.get('PROD_DES')} | 규격 {p.get('SIZE_DES')!r}"
                  f" | 단위 {p.get('UNIT')!r} | 재고 {p.get('BAL_FLAG')}"
                  f" | {str(p.get('OUT_PRICE',''))[:6]} | VAT포함 {p.get('OUT_PRICE_VAT')}")

# 급지 → 품목코드/단가 매핑 (regions.ts INITIAL_ZONES와 동일)
ZONE_PROD = {
    "1급지": ("wsl_z1", 2780), "2급지": ("wsl_z2", 2810),
    "3급지": ("wsl_z3", 3000), "4급지": ("wsl_z4", 3200),
    "5급지": ("wsl_z5", 3490), "6급지": ("wsl_z6", 3820),
    "7급지": ("wsl_z7", 4170),
}

def test_sale(sid):
    """계산서발급 데이터를 ECOUNT 매출로 등록 (동대문구 5월 예시).
    - 품목코드: 급지 매칭 (동대문=2급지=wsl_z2)
    - 품목명: '서울 동대문구 5월 정부양곡배송비'로 덮어쓰기
    - 금액: 우리 앱 계산 명시 전달 + 총합계 검증
    """
    from datetime import date
    today = date.today().strftime("%Y%m%d")
    region_full, month, zone = "경기 부천시 소사구", 5, "1급지"
    prod_cd, price = ZONE_PROD[zone]
    qty = 50                                    # (실제는 계산서발급 수량)
    prod_des = f"{region_full} {month}월 정부양곡배송비"
    tot = qty * price                           # VAT포함 합계
    sup = round(tot / 1.1)                       # 공급가 (우리 앱 방식)
    vat = tot - sup                              # 세액
    bulk = {
        "IO_DATE": today,
        "CUST": CUST_HOPE,
        "WH_CD": "100",
        "PROD_CD": prod_cd,
        "PROD_DES": prod_des,                   # 품목명 동적 덮어쓰기
        "QTY": str(qty),
        "PRICE": str(price),
        "SUPPLY_AMT": str(sup),
        "VAT_AMT": str(vat),
        "MAKE_FLAG": "Y",                       # 회계전표(매출전표 I) 자동생성 시도
    }
    r = post(f"{BASE}/Sale/SaveSale?SESSION_ID={sid}", {"SaleList": [{"BulkDatas": bulk}]})
    d = r.get("Data") or {}
    print(f"판매등록: 성공 {d.get('SuccessCnt')} / 실패 {d.get('FailCnt')} | 전표 {d.get('SlipNos')}")
    for x in (d.get("ResultDetails") or []):
        if not x.get("IsSuccess"):
            print("  실패:", x.get("TotalError"))
            for e in (x.get("Errors") or []):
                print("    필드", e.get("ColCd"), ":", e.get("Message"))
    print(f"  품목명: {prod_des}")
    print(f"  금액: 공급가 {sup:,} + 세액 {vat:,} = 합계 {tot:,}")


def register_cust(sid):
    """희망나르미 사회적협동조합 거래처 등록 (엔드포인트/페이로드 후보 탐색)."""
    name = "희망나르미 사회적협동조합"
    bulk = {
        "CUST": CUST_HOPE,                       # 4908200102 (하이픈 제거)
        # 거래처명 필드 후보 (ECOUNT가 맞는 것만 사용, 나머지 무시)
        "CUST_NAME": name,
        "CUST_DES": name,
        "CUST_NM": name,
        "BIZ_NM": name,
        "PRINT_CUST_NAME": name,
        # 대표자 후보
        "BOSS_NAME": "심재욱",
        "BOSS_NM": "심재욱",
        "BUSINESS_NO": "490-82-00102",
        "EMAIL": "hpnarami@narami.co.kr",
        "ADDR": "서울특별시 용산구 이촌로 103, 전면 2층 1호 (한강로3가, 천일빌딩)",
    }
    candidates = [
        ("AccountBasic/SaveBasicCust", "CustList"),
        ("AccountBasic/SaveBasicCustomer", "CustList"),
        ("AccountBasic/SaveBasicCust", "BasicCustList"),
        ("CommonBasic/SaveBasicCust", "CustList"),
    ]
    for action, listkey in candidates:
        try:
            r = post(f"{BASE}/{action}?SESSION_ID={sid}", {listkey: [{"BulkDatas": bulk}]})
            d = r.get("Data") or {}
            print(f"[{action} / {listkey}] Status {r.get('Status')} | 성공 {d.get('SuccessCnt')} / 실패 {d.get('FailCnt')}")
            for x in (d.get("ResultDetails") or []):
                if not x.get("IsSuccess"):
                    print("    실패:", x.get("TotalError"))
                    for e in (x.get("Errors") or []):
                        print("      필드", e.get("ColCd"), ":", e.get("Message"))
            if r.get("Status") == "200" and d.get("SuccessCnt"):
                print("  >> 거래처 등록 성공!")
                return
        except Exception as ex:
            print(f"[{action} / {listkey}] 예외: {str(ex)[:90]}")


def list_cust(sid):
    """거래처 조회 — 4908200102 / 희망나르미가 실제 저장됐는지 확인."""
    for action in ("AccountBasic/GetBasicCust",
                   "AccountBasic/GetBasicCustList",
                   "AccountBasic/GetBasicCustomersList",
                   "AccountBasic/GetBasicCustomerList"):
        try:
            r = post(f"{BASE}/{action}?SESSION_ID={sid}", {})
            d = r.get("Data") or {}
            res = d.get("Result")
            print(f"[{action}] Status {r.get('Status')} | 건수 {len(res) if res else 'N/A'}")
            if res:
                for c in res:
                    code = str(c.get("CUST", ""))
                    des = str(c.get("CUST_DES", ""))
                    if "4908200102" in code or "희망나르미" in des:
                        print("    >>", code, "|", des)
                return
        except Exception as ex:
            print(f"[{action}] 예외: {str(ex)[:80]}")


def fetch_manual(url):
    """ECOUNT OpenAPI 매뉴얼 HTML을 받아 저장 + 핵심 키워드 위치 출력."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    h = urllib.request.urlopen(req, timeout=45).read().decode("utf-8", "replace")
    with open("tools/ecount_manual.html", "w", encoding="utf-8") as f:
        f.write(h)
    print(f"HTML 저장: {len(h):,}자 → tools/ecount_manual.html")
    for kw in ["SaveSale", "세금계산서", "전자세금계산서", "TaxInvoice", "전자계산서",
               "SaveSlip", "회계전표", "전표", "Invoice", "Tax", "Account"]:
        c = h.count(kw)
        if c:
            i = h.find(kw)
            ctx = h[max(0, i - 25):i + 50].replace("\n", " ").replace("\r", " ")
            print(f"  '{kw}' x{c}  @{i}: ...{ctx}...")


def main():
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "manual":
        fetch_manual(sys.argv[2])
        return
    key = load_env()["ECOUNT_API_TEST_KEY"]
    sid = login(key)
    print("SESSION_ID:", len(sid), "자")
    mode = sys.argv[1] if len(sys.argv) > 1 else "verify"
    if mode == "verify":
        verify_one(sid)
    elif mode == "register":
        register_zones(sid)
    elif mode == "sale":
        test_sale(sid)
    elif mode == "cust":
        register_cust(sid)
    elif mode == "custlist":
        list_cust(sid)

if __name__ == "__main__":
    main()
