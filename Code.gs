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

const parse_schema = (header) => {
    const schema = [];

    for (const cell of header) {
        if (schema.length === 0) {
            schema.push({
                name: cell,
                entries: 1
            });
        } else {
            if (cell === '') {
                schema[schema.length - 1].entries += 1;
            } else {
                schema.push({
                    name: cell,
                    entries: 1
                })
            }
        }
    }

    // Allow for the user to specify that the last key is for an array of unbounded size
    if (schema.length >= 2 && schema[schema.length - 1].name === '...') {
        schema.pop();
        schema[schema.length - 1].entries = Infinity;
    }

    return schema;
}

const parse_row = (schema, row) => {
    let output = {};

    let i = 0;

    while (schema.length > 0) {
        const entry_schema = schema.shift();

        if (entry_schema.entries === 1) {
            output[entry_schema.name] = row[i];
        } else {
            output[entry_schema.name] = row.slice(i, i + entry_schema.entries).filter(v => v !== '');
        }

        i += entry_schema.entries;
    }

    return output;
};

const parse_sheet = (sheet) => {
    const data = sheet.getDataRange().getValues();

    if (data.length === 0 || data[0].length === 0) return;

    const header = data[0];
    const rows = data.slice(1);

    const schema = parse_schema(header);
    const entries = rows.map(row => parse_row(schema, row));

    return entries;
};

// publish updated JSON to S3 if changes were made to the first sheet
const publish = () => {
    const ui = SpreadsheetApp.getUi();

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getActiveSheet();

    const data = parse_sheet(sheet);

    // upload to AWS S3
    const name = s3_format(spreadsheet.getName());
    const id = spreadsheet.getId();
    const active_name = s3_format(sheet.getName());
    const active_id = sheet.getSheetId();

    const publish_path = [`${name}_${id}`, `${active_name}_${active_id}.json`].join('/');

    const response = s3PutObject(publish_path, data);
    const error = response.toString(); // response is empty if publishing successful

    if (error) {
        throw error;
    } else {
        ui.alert(`Data published to ${publish_path}!`);
    }
};
