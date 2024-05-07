// From https://github.com/smithy545/aws-apps-scripts

var AWS = (function () {
    // option constants
    var PARAM_BUCKET_NAME = "Bucket";

    // Keys cannot be retrieved once initialized but can be changed
    var accessKey;
    var secretKey;

    return {
        /**
         * Sets up keys for authentication so you can make your requests. Keys are not gettable once added.
         * @param {string} access_key - your aws access key
         * @param {string} secret_key - your aws secret key
         */
        init: function AWS(access_key, secret_key) {
            if (access_key == undefined) {
                throw "Error: No access key provided";
            } else if (secret_key == undefined) {
                throw "Error: No secret key provided";
            }
            accessKey = access_key;
            secretKey = secret_key;
        },
        /**
         * Authenticates and sends the given parameters for an AWS api request.
         * @param {string} service - the aws service to connect to (e.g. 'ec2', 'iam', 'codecommit')
         * @param {string} region - the aws region your command will go to (e.g. 'us-east-1')
         * @param {string} action - the api action to call
         * @param {Object} [params] - the parameters to call on the action. Defaults to none.
         * @param {string} [method=GET] - the http method (e.g. 'GET', 'POST'). Defaults to GET.
         * @param {(string|object)} [payload={}] - the payload to send. Defults to ''.
         * @param {Object} [headers={Host:..., X-Amz-Date:...}] - the headers to attach to the request. Host and X-Amz-Date are premade for you.
         * @param {string} [uri='/'] - the path after the domain before the action. Defaults to '/'.
         * @param {Object} [options] - additional service specific values
         * @return {string} the server response to the request
         */
        request: function (service, region, action, params, method, payload, headers, uri, options) {
            if (service == undefined) {
                throw "Error: Service undefined";
            } else if (region == undefined) {
                throw "Error: Region undefined";
            } else if (action == undefined) {
                throw "Error: Action undefined";
            }

            var options = options || {};
            var bucket = options[PARAM_BUCKET_NAME];
            if (service == "s3" && action != "ListAllMyBuckets" && bucket == undefined) {
                throw "Error: S3 Bucket undefined";
            }

            if (payload == undefined) {
                payload = "";
            } else if (typeof payload !== "string") {
                payload = JSON.stringify(payload);
            }

            var d = new Date();

            var dateStringFull = String(d.getUTCFullYear()) + addZero(d.getUTCMonth() + 1) + addZero(d.getUTCDate()) + "T" + addZero(d.getUTCHours()) + addZero(d.getUTCMinutes()) + addZero(d.getUTCSeconds()) + 'Z';
            var dateStringShort = String(d.getUTCFullYear()) + addZero(d.getUTCMonth() + 1) + addZero(d.getUTCDate());
            var payload = payload || '';
            var hashedPayload = Utilities.base64Decode(Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload))).map(byte => {
                if (byte < 0) {
                    byte += 256;
                }

                return byte.toString(16).padStart(2, '0');
            }).join('');
            var method = method || "GET";
            var uri = uri || "/";
            var host = getHost(service, region, bucket);
            var headers = headers || {};
            var request;
            var query;
            if (method.toLowerCase() == "post") {
                request = "https://" + host + uri;
                query = '';
            } else {
                query = "Action=" + action;
                if (params) {
                    Object.keys(params).sort(function (a, b) { return a < b ? -1 : 1; }).forEach(function (name) {
                        query += "&" + name + "=" + fixedEncodeURIComponent(params[name]);
                    });
                }
                request = "https://" + host + uri + "?" + query;
            }

            var canonQuery = getCanonQuery(query);
            var canonHeaders = "";
            var signedHeaders = "";
            headers["Host"] = host;
            headers["X-Amz-Date"] = dateStringFull;
            headers["X-Amz-Target"] = action;
            headers["X-Amz-Content-SHA256"] = hashedPayload.toString();
            Object.keys(headers).sort(function (a, b) { return a < b ? -1 : 1; }).forEach(function (h, index, ordered) {
                canonHeaders += h.toLowerCase() + ":" + headers[h] + "\n";
                signedHeaders += h.toLowerCase() + ";";
            });
            signedHeaders = signedHeaders.substring(0, signedHeaders.length - 1);

            var CanonicalString = method + '\n'
                + uri + '\n'
                + query + '\n'
                + canonHeaders + '\n'
                + signedHeaders + '\n'
                + hashedPayload;
            var canonHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, CanonicalString);

            var algorithm = "AWS4-HMAC-SHA256";
            var scope = dateStringShort + "/" + region + "/" + service + "/aws4_request";

            var StringToSign = algorithm + '\n'
                + dateStringFull + '\n'
                + scope + '\n'
                + canonHash;

            const key = getSignatureKey(secretKey, dateStringShort, region, service);
            const signature = Utilities.computeHmacSha256Signature(key, Utilities.base64Decode(Utilities.base64Encode(StringToSign))).map(byte => {
                if (byte < 0) {
                    byte += 256;
                }

                return byte.toString(16).padStart(2, '0');
            }).join('');

            var authHeader = algorithm + " Credential=" + accessKey + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;

            headers["Authorization"] = authHeader;
            delete headers["Host"];
            var options = {
                method: method,
                headers: headers,
                muteHttpExceptions: true,
                payload: payload,
            };

            var response = UrlFetchApp.fetch(request, options);
            return response;
        },
        /**
         * Sets new authorization keys
         * @param {string} access_key - the new access_key
         * @param {string} secret_key - the new secret key
         */
        setNewKey: function (access_key, secret_key) {
            if (access_key == undefined) {
                throw "Error: No access key provided";
            } else if (secret_key == undefined) {
                throw "Error: No secret key provided";
            }
            accessKey = access_key;
            secretKey = secret_key;
        }
    };

    function getHost(service, region, bucket) {
        var is_s3 = (service == "s3");
        return [
            bucket,
            service,
            (is_s3 ? undefined : region),
            "amazonaws.com"
        ].filter(Boolean).join(".");
    }

    function getCanonQuery(r) {
        var query = r.split("&").sort().join("&");

        var canon = "";
        for (var i = 0; i < query.length; i++) {
            var element = query.charAt(i);
            if (isCanon(element)) {
                canon += element;
            } else {
                canon += "%" + element.charCodeAt(0).toString(16)
            }
        }

        return canon;
    }

    // For characters only
    function isCanon(c) {
        return /[a-z0-9-_.~=&]/i.test(c);
    }

    function addZero(s) {
        return (Number(s) < 10 ? '0' : '') + String(s);
    }

    /**
     * Source: http://docs.aws.amazon.com/general/latest/gr/signature-v4-examples.html#signature-v4-examples-jscript
     */
    function getSignatureKey(key, dateStamp, regionName, serviceName) {
        const kDate = Utilities.computeHmacSha256Signature('AWS4' + key, dateStamp);
        const kRegion = Utilities.computeHmacSha256Signature(kDate, Utilities.base64Decode(Utilities.base64Encode(regionName)));
        const kService = Utilities.computeHmacSha256Signature(kRegion, Utilities.base64Decode(Utilities.base64Encode(serviceName)));
        const kSigning = Utilities.computeHmacSha256Signature(kService, Utilities.base64Decode(Utilities.base64Encode('aws4_request')));

        return kSigning;
    }

    /**
     * Strictly adhere to RFC3986 for URI encoding
     *
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
     *
     * @param str
     * @returns {string}
     */
    function fixedEncodeURIComponent(str) {
        return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
            return '%' + c.charCodeAt(0).toString(16);
        });
    }
})();
