"""Census state FIPS codes to USPS abbreviations.

Keys are the 2-digit ANSI state FIPS codes used by TIGER ``statefp``.
The map covers the 50 states, the District of Columbia, and the
territories American Samoa, Guam, the Northern Mariana Islands,
Puerto Rico, and the U.S. Virgin Islands (56 codes).
"""

from __future__ import annotations

FIPS_TO_STATE: dict[str, str] = {
    "01": "AL",  # Alabama
    "02": "AK",  # Alaska
    "04": "AZ",  # Arizona
    "05": "AR",  # Arkansas
    "06": "CA",  # California
    "08": "CO",  # Colorado
    "09": "CT",  # Connecticut
    "10": "DE",  # Delaware
    "11": "DC",  # District of Columbia
    "12": "FL",  # Florida
    "13": "GA",  # Georgia
    "15": "HI",  # Hawaii
    "16": "ID",  # Idaho
    "17": "IL",  # Illinois
    "18": "IN",  # Indiana
    "19": "IA",  # Iowa
    "20": "KS",  # Kansas
    "21": "KY",  # Kentucky
    "22": "LA",  # Louisiana
    "23": "ME",  # Maine
    "24": "MD",  # Maryland
    "25": "MA",  # Massachusetts
    "26": "MI",  # Michigan
    "27": "MN",  # Minnesota
    "28": "MS",  # Mississippi
    "29": "MO",  # Missouri
    "30": "MT",  # Montana
    "31": "NE",  # Nebraska
    "32": "NV",  # Nevada
    "33": "NH",  # New Hampshire
    "34": "NJ",  # New Jersey
    "35": "NM",  # New Mexico
    "36": "NY",  # New York
    "37": "NC",  # North Carolina
    "38": "ND",  # North Dakota
    "39": "OH",  # Ohio
    "40": "OK",  # Oklahoma
    "41": "OR",  # Oregon
    "42": "PA",  # Pennsylvania
    "44": "RI",  # Rhode Island
    "45": "SC",  # South Carolina
    "46": "SD",  # South Dakota
    "47": "TN",  # Tennessee
    "48": "TX",  # Texas
    "49": "UT",  # Utah
    "50": "VT",  # Vermont
    "51": "VA",  # Virginia
    "53": "WA",  # Washington
    "54": "WV",  # West Virginia
    "55": "WI",  # Wisconsin
    "56": "WY",  # Wyoming
    "60": "AS",  # American Samoa
    "66": "GU",  # Guam
    "69": "MP",  # Northern Mariana Islands
    "72": "PR",  # Puerto Rico
    "78": "VI",  # U.S. Virgin Islands
}


def fips_to_abbrev(statefp: str | None) -> str | None:
    """Return the USPS abbreviation for a 2-digit state FIPS code.

    Returns None when ``statefp`` is None or is not a key in
    ``FIPS_TO_STATE`` (offshore endpoints and unassigned codes).
    """
    if statefp is None:
        return None
    return FIPS_TO_STATE.get(statefp)
