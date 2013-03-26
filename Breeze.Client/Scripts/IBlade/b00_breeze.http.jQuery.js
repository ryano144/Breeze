// needs JQuery >=1.5
(function(factory) {
    // Module systems magic dance.

    if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
        // CommonJS or Node: hard-coded dependency on "breeze"
        factory(require("breeze"));
    } else if (typeof define === "function" && define["amd"]) {
        // AMD anonymous module with hard-coded dependency on "breeze"
        if (breeze) {
            factory(breeze);
        } else {
            define(["breeze"], factory);
        }
    } else {
        // <script> tag: use the global `breeze` object
        factory(breeze);
    }
}(function(breeze) {
    var core = breeze.core;
    
    var ctor = function () {
        this.name = "jQuery";
        this.defaultSettings = { };
    };

    ctor.prototype.initialize = function () { };

    ctor.prototype.send = send;
    
    function send(options) {
        var settings = getSettingsForOperation(options, this.defaultSettings);
        return jqSend(settings);
    }
    
    //#region jQuery helpers 
    // This stuff is probably reusable for almost any adapter that uses jQuery.ajax
    // Todo: move to helper file(s) as appropriate
 
    // self modifying function
    function jqAjax(settings) {
        var jQuery = core.requireLib("jQuery", "needed for http adapter pluggin");
        jqAjax = jQuery.ajax; 
        return jqAjax(settings);
    }
       
    function jqSend(settings) {
        var jqXHR = jqAjax(settings);
        
        var promise = Q.when(jqXHR).then(succeeded, failed);

        // Todo: Add qRemora to add abort
        // promise = core.qRemora(promise, { abort: abort });
        
        return promise;

        // see qRemora note above
        // Add abort() to promise
        //function abort() {
        //    try {
        //        jqXHR.abort(); // should trigger fail  
        //    } catch (e) {      // eat it
        //    } finally {        // only call it once
        //        jqXHR.abort = null;
        //    }
        //};
    }
    function succeeded(data, textStatus, xhr) {
        return makeAdapterResponse(data, textStatus || 'success', xhr);
    }

    // Todo: determine if and how called when aborted
    // Todo: determine if called when JSOP request fails.
    // may have to ensure there is a timeout or use some other gambit
    // See http://stackoverflow.com/questions/10215512/jsonp-error-in-jquery-1-7
    // Plenty of debate about whether it does or doesn't work
    function failed(xhr, textStatus, errorThrown) {
        return makeAdapterResponse(xhr.responseText, textStatus || 'error', xhr);
    }

    //#endregion

    //#region xhr helpers
    // This stuff is probably reusable for almost any adapter that uses xhr, jQuery or otherwise
    // Todo: move to helper file(s) as appropriate

    function getSettingsForOperation(options, defaultSettings) {

        // blend defaultSettings with defaults
        // requires version of core.extend that accepts multiple sources
        var settings = core.extend({}, defaultSettings, options.adapterSettings);

        // overide with specific options and operation instructions
        settings.uri = options.uri || settings.uri;

        if (/savechanges/i.test(options.operation)) {
            settings.type = 'POST';
            settings.dataType = 'json';
            settings.contentType = 'application/json';
            settings.data = options.data || settings.data || {};
        } else {
            settings.type = settings.type || 'GET';
            settings.dataType = settings.dataType || 'json';
        }

        return settings;
    }
   /**
   * Returns an http adapter response object.
   *
   * @param {(string|Object)} data If a success response, the response data; if error, the error response.
   * @param {(string)} textStatus Short general statement of this response (e.g, 'success' or 'error').
   * @param {(Object)} xhr An instance of XMLHttpRequest ... or its surrogate ... used in the call.
   */
    function makeAdapterResponse(data, textStatus, xhr) {

        xhr = cleanupXhr(xhr);

        var adapterResponse = {
            data: data,
            status: textStatus,
            statusCode: xhr.status,
            statusCodeText: xhr.statusText,
            headers: headersGetter(xhr.getAllResponseHeaders()),
            adapterExports: { xhr: xhr }
        };
        return adapterResponse;
    }

    function cleanupXhr(xhr) {
        xhr = xhr || { status: 0, statusText: "" };
        if (!xhr.getAllResponseHeaders) {
            xhr.getAllResponseHeaders = function () { return ""; };
        }
        // can no longer abort or listen to xhr state changes    
        xhr.abort = null;
        xhr.onreadystatechange = null;
        return xhr;
    }
    
    /**
    * https://github.com/angular/angular.js/blob/master/src/ng/http.js
    * Returns a function that provides access to parsed headers.
    *
    * Headers are lazy parsed when first requested.
    * @see parseHeaders
    *
    * @param {(string|Object)} headers Headers to provide access to.
    * @returns {function(string=)} Returns a getter function which if called with:
    *
    *   - if called with single an argument returns a single header value or null
    *   - if called with no arguments returns an object containing all headers.
    */
    function headersGetter(headers) {
        var headersObj = isObject(headers) ? headers : undefined;

        return function(name) {
            if (!headersObj) headersObj = parseHeaders(headers);

            if (name) {
                return headersObj[name.toLowerCase()] || null;
            }

            return headersObj;
        };
    }

    // Todo: seems generally useful. Add to core.coreFns?
    /**
     * @ngdoc function
     * @name angular.isObject
     * @function
     *
     * @description
     * Determines if a reference is an `Object`. Unlike `typeof` in JavaScript, `null`s are not
     * considered to be objects.
     *
     * @param {*} value Reference to check.
     * @returns {boolean} True if `value` is an `Object` but not `null`.
     */
    function isObject(value) { return value != null && typeof value == 'object'; }

    /**
     * https://github.com/angular/angular.js/blob/master/src/ng/http.js
     * Parse headers into key value object
     *
     * @param {string} headers Raw headers as a string
     * @returns {Object} Parsed headers as key value object
     */
    function parseHeaders(headers) {
        var parsed = {}, key, val, i;

        if (!headers) return parsed;

        forEach(headers.split('\n'), function(line) {
            i = line.indexOf(':');
            key = line.substr(0, i).trim().toLowerCase();
            val = line.substr(i + 1).trim();

            if (key) {
                if (parsed[key]) {
                    parsed[key] += ', ' + val;
                } else {
                    parsed[key] = val;
                }
            }
        });

        return parsed;
    }

    //#endregion

    // last param is true because for now we only have one impl.
    breeze.config.registerAdapter("http", ctor);
    
}));
