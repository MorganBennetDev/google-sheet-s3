// add a menu to the toolbar...
const createMenu = () => {
    const menu = SpreadsheetApp.getUi()
        .createMenu('Publish Data')
        .addItem('Publish', 'publish');

    menu.addToUi();
};

// ...when the add-on is installed or opened
const onOpen = () => {
    createMenu();
};

const onInstall = () => {
    createMenu();
};

// https://github.com/liddiard/google-sheet-s3/issues/3#issuecomment-1276788590
const s3PutObject = (objectName, object) => {
    const scriptProps = PropertiesService.getScriptProperties().getProperties();

    const awsAccessKeyId = scriptProps['AWS_ACCESS_KEY_ID'];
    const awsSecretKey = scriptProps['AWS_SECRET_KEY'];
    const awsRegion = scriptProps['AWS_REGION'];
    const bucketName = scriptProps['BUCKET'];

    const contentType = 'application/json';

    const contentBlob = Utilities.newBlob(JSON.stringify(object), contentType);
    contentBlob.setName(objectName);

    const service = 's3';
    const action = 'PutObject';
    const params = {};
    const method = 'PUT';
    const payload = contentBlob.getDataAsString();
    const headers = {
        'Content-Type': contentType
    };
    const uri = `/${objectName}`;
    const options = {
        Bucket: bucketName
    };

    AWS.init(awsAccessKeyId, awsSecretKey);
    return AWS.request(service, awsRegion, action, params, method, payload, headers, uri, options);
};

const s3_format = (s) => s.replace(/\s+/g, '_').replace(/[^\w\-_]/g, '');

// checks if document has the required configuration settings to publish to S3
// Note: does not check if the config is valid
const hasRequiredProps = () => {
    const props = PropertiesService.getDocumentProperties().getProperties();
    const requiredProps = [
        'projectName'
    ];
    return requiredProps.every(prop => props[prop]);
};

const parse_sheet = (sheet) => {
    // get cell values from the range that contains data (2D array)
    const rows = sheet
        .getDataRange()
        .getValues()
        // filter out empty rows
        .filter(row =>
            row.some(val => val !== null)
        )
        // filter out columns that don't have a header (i.e. text in row 1)
        .map((row, _, rows) =>
            row.filter((_, index) => rows[0][index].length)
        );

    // create an array of cell objects keyed by header
    const cells = rows
        // exclude the header row
        .slice(1)
        .map(row =>
            row.reduce((acc, val, index) =>
                // represent blank cell values as `null`
                // blank cells always appear as an empty string regardless of the data
                // type of other values in the column. neutralizing everything to `null`
                // lets us avoid mixing empty strings with other data types within a column.
                Object.assign(
                    acc,
                    { [rows[0][index]]: (typeof val === 'string' && !val.length) ? null : val }
                )
                , {})
        );

    return cells;
};

// publish updated JSON to S3 if changes were made to the first sheet
const publish = () => {
    const ui = SpreadsheetApp.getUi();

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getActiveSheet();

    const data = parse_sheet(sheet);

    // upload to AWS S3
    const name = s3_format(spreadsheet.getName());
    const id = sheet.getId();
    const active_name = s3_format(sheet.getActiveSheet().getName());
    const active_id = sheet.getActiveSheet().getSheetId();

    const publish_path = [`${name}_${id}`, `${active_name}_${active_id}.json`].join('/');

    const response = s3PutObject(publish_path, data);
    const error = response.toString(); // response is empty if publishing successful

    if (error) {
        throw error;
    } else {
        ui.alert(`Data published to ${publish_path}!`);
    }
};
