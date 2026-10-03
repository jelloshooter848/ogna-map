# Public Records Act request: Gilroy secured tax roll

✅ Decided: request the actual tax roll from the County, sent **by the organizer as an individual**, covering
**all of Gilroy** (so Oldtown can be compared with the city), with the Oldtown parcel list as a fallback.

## How to send it

1. Go to the County **Finance Agency** public records page:
   **https://faf.santaclaracounty.gov/request-public-records**. The Finance Agency includes the Department of Tax
   and Collections. Use the request form or email address listed there. If you aren't sure where it goes, call
   the Department of Tax and Collections at **(408) 808-7900** and ask where to send a Public Records Act
   request for tax roll data.
2. Paste the request below, fill in your name and email, and attach **[`oldtown_apns.csv`](oldtown_apns.csv)**,
   the 3,161 parcels in the draft Oldtown district.
3. Save a copy and **write down the date you sent it.**

**What happens next:** within **10 days** the County must tell you whether it has the records and when it will
provide them. It can extend that by **14 days** for data requests like this one. If there's a fee for pulling the
data, you've asked for the estimate first, so nothing is charged without your OK.

---

**Subject:** California Public Records Act request: secured property tax roll data, City of Gilroy

To the Custodian of Records, Department of Tax and Collections, County of Santa Clara:

Under the California Public Records Act (Government Code § 7920.000 et seq.), I request an electronic copy of
the following information for all **secured parcels located in the City of Gilroy** (or in the tax rate areas
that make up the City of Gilroy), for the **2025–26** secured roll and, if it is available, the **2026–27** roll:

1. Assessor's Parcel Number (APN)
2. Tax rate area (TRA)
3. Assessed value of land
4. Assessed value of improvements
5. Exemptions (amount and type, for example the homeowners' exemption)
6. Net taxable value
7. Total ad valorem tax billed
8. Direct charges and special assessments billed, in total and by charge if available
9. Total amount billed for the year

I do **not** need owner names or mailing addresses; please leave those out.

I understand the County keeps this information electronically. Under Government Code § 7922.570, please
provide it in an electronic format, preferably a CSV or Excel file with one row per parcel, together with the
field layout or data dictionary that explains the columns. If there are fees for data extraction or
duplication under § 7922.575, please send me an estimate before you begin.

If producing a citywide extract would be burdensome, the same information for the parcels listed in the
attached file (`oldtown_apns.csv`, parcels in Gilroy's downtown and surrounding neighborhoods) would also meet
my needs.

If any part of this request is denied, please cite the specific exemption and release every segregable portion.
If another office, such as the Office of the Assessor, holds some of these fields, I'd appreciate your forwarding
that part of the request or telling me whom to contact.

Thank you,

[Your name]
[Email]
[Phone, optional]

---

## If you hear nothing after 10 days

Reply to your original request, or send it to the same address:

> **Subject:** Follow-up: Public Records Act request of [date] (Gilroy secured tax roll)
>
> I'm following up on my Public Records Act request of [date] for secured tax roll data for parcels in the City
> of Gilroy (copy below). Under Government Code § 7922.535 a determination was due within 10 days. Could you
> let me know its status and when I can expect the records?
>
> Thank you, [name]

## When the file arrives

- **Keep it private.** Don't commit it to GitHub or share it widely. (`.gitignore` already blocks `*.csv`,
  `*.xlsx` and `private/`, but `docs/oldtown_apns.csv` is deliberately committed: it's public parcel data.)
- **Excel file:** open it and use File → Save As → CSV.
- **Fixed-width text file, or anything unusual:** send Claude the field layout plus 2–3 rows with the numbers
  changed, and it will adjust the importer.
- **Load it:** open **https://oldtowngilroy.org/organize/**, expand **Property tax data (private)**, click
  **Import tax roll (CSV)**, check the matched columns, then click **Use these columns**. The status line shows
  how many lots matched. The data is kept only in that browser; repeat the import on each computer that needs it.

## Other ways to get tax data

- **Assessor's bulk files:** the Assessor's Office sells a Secured Master File (roll values, exemptions, tax rate
  area). It has values but not billed amounts, so the map would estimate tax from values (`EST_TAX_RATE` in
  `js/config.js`).
- **A few lots by hand:** look parcels up on the County's property tax site and type them into a spreadsheet with
  `APN` and `Total Tax` columns. That's useful for testing the import.
