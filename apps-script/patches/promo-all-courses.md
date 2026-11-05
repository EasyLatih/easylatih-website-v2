# Promo codes valid for all programmes (Management System V2 - STAGING)

In `Code.gs` of **EasyLatih Management System V2 - STAGING**, inside `validatePromoCode(courseId, promoCode)`,
replace the loop header

```js
  for (let i = 1; i < values.length; i++) {
    const rowCode = String(values[i][promoCodeCol]).trim().toUpperCase();
    const rowCourse = String(values[i][courseIdCol]).trim().toUpperCase();

    if (rowCode === inputCode && rowCourse === inputCourse) {
```

with

```js
  // A row for the exact course wins; CourseID "ALL" makes a code valid for every programme.
  const findPromoRow = course => {
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][promoCodeCol]).trim().toUpperCase() === inputCode &&
          String(values[r][courseIdCol]).trim().toUpperCase() === course) return r;
    }
    return -1;
  };
  let match = findPromoRow(inputCourse);
  if (match === -1) match = findPromoRow("ALL");

  for (let i = match; i !== -1; i = -1) {
    {
```

then deploy a new version of the web app. Pair with `supabase/promo-codes-all-courses.sql`.

## Server re-checks the discount on submit

In `doPost`, the registration `data` object no longer takes `discountCode` / `discountAmount` from the
browser. After building `data`, the submitted code is looked up again with `validatePromoCode(courseId, code)`;
an invalid code returns `ERROR: …` (the `/api/public-registration` proxy reports it as a failed submission),
and a valid one sets `data.discountCode` and `data.discountAmount` from the PromoCodes sheet.
