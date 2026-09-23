# Draft Public Records Act request: Gilroy secured tax roll

Send to the County of Santa Clara **Department of Tax and Collections** (it bills and collects property
tax). The county takes Public Records Act requests through its online records request portal, or by mail or
email to the department. Keep a copy and note the date: the county has 10 days to say whether it has the
records and when it will produce them.

---

**Subject:** California Public Records Act request: secured property tax roll data for the City of Gilroy

To the Custodian of Records, Department of Tax and Collections, County of Santa Clara:

Under the California Public Records Act (Government Code § 7920.000 et seq.), I request an electronic
copy of the following records for all **secured parcels located in the City of Gilroy** (or in the tax
rate areas that make up the City of Gilroy) for the **2025–26 tax year** (or the most recent completed tax
year):

1. Assessor's Parcel Number (APN)
2. Tax rate area (TRA)
3. Assessed value of land
4. Assessed value of improvements
5. Exemptions (amount and type, e.g. homeowners' exemption)
6. Net taxable value
7. Total ad valorem tax billed
8. Direct charges / special assessments billed, in total and by charge if available
9. Total amount billed (both installments)

I do **not** need owner names or mailing addresses; please feel free to leave those fields out.

I am asking for data the County already keeps in electronic form. Under Government Code § 7922.570, please
provide it in an electronic format such as CSV or Excel. If there are fees for duplication or for data
extraction under § 7922.575, please tell me the estimated cost before processing the request.

If any part of this request is denied, please cite the specific exemption and release every segregable
portion of the records. If a different department (for example the Office of the Assessor) holds some of
these fields, I would appreciate your forwarding that part or telling me whom to contact.

Thank you,

[Name]
[Organization: Oldtown Gilroy Neighborhood Alliance, if applicable]
[Email / phone]

---

## Notes

- **The Assessor's alternative.** The Assessor's Office sells bulk data files, including the Secured Master
  File (roll values, exemptions, tax rate area). Buying that gives values but not billed amounts; the app
  then estimates tax from values (see `EST_TAX_RATE` in `js/config.js`).
- **Loading the file.** Open the app, go to **Property tax data (private)**, choose **Import tax roll (CSV)**,
  and match the columns. Save Excel files as CSV first. The file stays on your computer: only APNs and dollar
  columns are kept, in that browser. Don't commit the file; `.gitignore` already excludes `*.csv`,
  `*.xlsx` and `private/`.
