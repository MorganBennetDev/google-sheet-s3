# Google Sheets to S3

A [Google Apps Script](https://developers.google.com/apps-script/) that publishes a Google Sheet to Amazon S3 as a JSON file. Creates an array of objects keyed by column header, maintaining data types like numbers and booleans. Also supports keys with multiple entries (i.e. arrays).

## Why?

### Use case 

"I want to display simple, structured, spreadsheet-like, publicly accessible data on a website (possibly with thousands of simultaneous visitors) that is easily updatable (possibly by multiple people at once) without the overhead and time of coding, deploying, and maintaining a database, API, and admin interface."

## Why not [alternative]?

- Doesn't require OAuth like the [official Google Sheets API](https://developers.google.com/sheets/guides/authorizing) (no good for anonymous data viewing).
- Not using [deprecated APIs](https://developers.google.com/gdata/samples/spreadsheet_sample) like [Tabletop.js](https://github.com/jsoma/tabletop) that could suffer an untimely disappearance at the whims of Google.
- Doesn't require an intermediary web application like [WSJ uses/used](https://gist.github.com/jsvine/3295633).
- Not an alternative service like [Airtable](https://airtable.com) that is powerful but costs 💰💰💰.
- Not slow at returning data like [Google Apps Script Web Apps](http://pipetree.com/qmacro/blog/2013/10/sheetasjson-google-spreadsheet-data-as-json/
) seem to be. (If you're okay with 2000ms response times, this solution is easier because it doesn't involve S3. S3 response times tend to be 10-20x faster.)

## Setup

We need to get an Amazon Web Services (AWS) S3 bucket and your Google Sheet to talk to each other, so there are two parts to this setup: one for AWS, and one for the spreadsheet.

### AWS setup

1. If you don't have one already, [create an Amazon AWS account](https://aws.amazon.com).
2. If you don't have one already, [create an AWS S3 bucket](https://s3.console.aws.amazon.com/s3/).
3. If you don't have one already, [create an IAM user](https://console.aws.amazon.com/iam/home?nc2=h_m_sc#users) that has write permission to your S3 bucket. You'll need these credentials later.
4. Add a **bucket policy** that enables public viewing of the published JSON. To enable, go to your [S3 Management Console](https://s3.console.aws.amazon.com/s3/), click your bucket's name > Permissions tab > Bucket policy > enter your policy (sample to paste below) > click Save.
5. If you're going to be accessing the published JSON data from a web browser, you will also need to add a **CORS policy** to your S3 bucket that allows GET requests from whatever origin (domain name) you want to access your data from. To add a policy, go to your [S3 Management Console](https://s3.console.aws.amazon.com/s3/), click your bucket's name > Permissions tab > CORS configuration > enter your policy (sample to paste below) > click Save.

#### Sample bucket policy

This configuration is what I imagine most people using this add-on will want. It allows **public** access of the data stored in your Google Sheet, but **not** public write access.

Replace the text "PUT-YOUR-BUCKET-NAME-HERE" with your bucket's name.
    
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AddPerm",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::PUT-YOUR-BUCKET-NAME-HERE/*"
        }
    ]
}
```
    
#### Sample CORS policy

This configuration will allow any web page on the internet to access your sheet's data. You may not want that. You can modify the line `<AllowedOrigin>*</AllowedOrigin>` and replace the asterisk with your own hostname; e.g. the domain name from which you will be making Ajax requests for the sheet's JSON.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <MaxAgeSeconds>3000</MaxAgeSeconds>
    <AllowedHeader>Authorization</AllowedHeader>
</CORSRule>
</CORSConfiguration>
```

### Google Sheet setup

How to use the add-on **after** completing the above AWS setup.

1. Create or open an existing Google Sheet.
2. Format the sheet so that the first row contains the column headers you want your JSON objects to have as properties.

Any time you want to update the published JSON, go to menu item Add-ons > Publish Google Sheets to AWS S3 > Publish Current Sheet.

## Usage notes

- The JSON file's filename is a combination of the sheet's name and ID. Its parent folder is a combination of the spreadsheet's name and ID. These will be shown after publishing.
- To make the last column an array add a column after it with the name "...".
- Text will be published as an array of objects with formatting information (i.e. `{text: "blah", bold: false, italic: true, url: 'https://www.google.com'}`). Take this into account when using output.
- A blank cell in a row is represented in the JSON as `null`. So if you have a column that could have missing or optional values, be sure to handle the `null` value in your consuming code.

## Development setup instructions

1. Create a new [Google Apps Script](https://script.google.com/home) with files whose names and content matches the ones in this repo (minus this readme).
2. In the menu bar, click Deploy > Test Deployments.
3. On the left sidebar, Select type > Editor Add-on.
4. Under Editor Add-on, press Create new test.
5. Version: Latest code, Config: Installed and enabled, Test document: (select a spreadsheet to use)
6. Press Done.
7. Select the saved test and press Execute.
