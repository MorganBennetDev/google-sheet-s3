const createMenu = () => {
    const menu = SpreadsheetApp.getUi()
        .createMenu('Publish Data')
        .addItem('Publish', 'publish');

    menu.addToUi();
};

const onOpen = () => {
    createMenu();
};

const onInstall = () => {
    createMenu();
};

/**
 * Attempts to publish an object to S3 and returns the response.
 * @param objectName The name of the object to be published to S3.
 * @param object The object to be published to S3.
 * @returns The response from S3 to the publishing request.
 */
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

/**
 * Formats strings as valid S3 filenames. Replaces any runs of one or more whitespace characters with underscores and then removes any characters aside from letters, digits, underscores, and hyphens.
 * @param {string} s The string to be formatted
 * @returns {string} A valid S3 filename similar to s.
 */
const s3_format = (s) => s.replace(/\s+/g, '_').replace(/[^\w\-_]/g, '');

/**
 * Transforms the header row of a spreadsheet into a schema to aid in parsing data rows later on. The number of entries for each key is determined by the number of empty cells following it in the header row with the exception of the last key. The last key will be treated as a single value unless it is followed directly by a "..." key, in which case it will be treated as having potentially infinite entries.
 * @param {any[]} header The header row of a spreadsheet
 * @returns {{name: string, entries: number}[]} The data schema for this sheet derived from the header row.
 */
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

/**
 * Parses a row of data according to a provide schema from {@link parse_schema}.
 * @param {{name: string, entries: number}[]} schema The data schema of this sheet defined by {@link parse_schema}.
 * @param {any[]} row The row of data to be parsed
 * @returns {{[string]: string | string[]}} An object representing this row of data.
 */
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

/**
 * Takes a Google Sheet object and outputs an array of objects representing its rows parsed with a shcema defined by its header (first) row and {@link parse_schema}.
 * @param {Sheet} sheet A Google Sheet object.
 * @returns {{[string]: string | string[]}[]} An array of the parsed row objects.
 */
const parse_sheet = (sheet) => {
    const data = sheet.getDataRange().getValues();

    if (data.length === 0 || data[0].length === 0) return;

    const header = data[0];
    const rows = data.slice(1);

    const schema = parse_schema(header);
    const entries = rows.map(row => parse_row(schema, row));

    return entries;
};

/**
 * Parses the currently active sheet and publishes the result to S3 at "<spreadsheet name>_<spreadsheet id>/<sheet name>_<sheet id>.json".
 */
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
        ui.alert(`There was an error publishing your sheet. ${error}`)
        throw error;
    } else {
        ui.alert(`Data published to ${publish_path}!`);
    }
};
