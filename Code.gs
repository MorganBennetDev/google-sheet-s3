// add a menu to the toolbar...
const createMenu = () => {
    const menu = SpreadsheetApp.getUi()
        .createMenu('Publish Data')
        .addItem('Set Project Name', 'showConfig');

    if (hasRequiredProps()) {
        menu.addItem('Publish', 'publish');
    }

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

// publish updated JSON to S3 if changes were made to the first sheet
const publish = () => {
    const ui = SpreadsheetApp.getUi();

    if (!hasRequiredProps()) {
        ui.alert('Please set project name before publishing.')

        return;
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const props = PropertiesService.getDocumentProperties().getProperties();
    // do nothing if required configuration settings are not present, or
    // if the edited sheet is not the first one (sheets are indexed from 1,
    // not 0)
    if (sheet.getActiveSheet().getIndex() > 1) {
        ui.alert('Can only publish first sheet.');

        return;
    }

    // get cell values from the range that contains data (2D array)
    const rows = sheet
        .getDataRange()
        .getValues()
        // filter out empty rows
        .filter(row =>
            row.some(val => typeof val !== 'string' || val.length)
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

    // upload to AWS S3
    const response = s3PutObject([props.projectName, `${sheet.getId()}`].join('/'), cells);
    const error = response.toString(); // response is empty if publishing successful
    if (error) {
        throw error;
    }
};

// show the configuration modal dialog UI
const showConfig = () => {
    const props = PropertiesService.getDocumentProperties();
    const projectName = props.getProperty('projectName') === null ? 'Project' : props.getProperty('projectName');
    const ui = SpreadsheetApp.getUi();

    const result = ui.prompt(
        `Rename ${projectName}`,
        'Project Name',
        ui.ButtonSet.OK_CANCEL
    );

    const button = result.getSelectedButton();
    const input = result.getResponseText();

    if (button === ui.Button.OK) {
        const nextName = s3_format(input);
        props.setProperty('projectName', nextName);
        ui.alert(`Project name set to "${nextName}"`);
    }
};
