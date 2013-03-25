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
    
    //#region jQuery helper 
    // This stuff is probably reusable for almost any adapter that uses jQuery.ajax
    // Todo: move to helper file(s) as appropriate
 
    // self modifying function
    function jqAjax(settings) {
        var jQuery = core.requireLib("jQuery", "needed for 'ajax_jQuery' pluggin");
        jqAjax = jQuery.ajax; 
        return jqAjax(settings);
    }
    
    function getSettingsForOperation(options, defaultSettings) {
        
        var settings = core.extend({}, options.adapterSettings); // clone settings

        settings.uri = options.uri;
        
        if (/savechanges/i.test(options.operation)) {
            settings.type = 'POST';
            settings.dataType = 'json';
            settings.contentType = 'application/json';
            settings.data = options.data || settings.data || {};
        } else {
            settings.type = 'GET';
            settings.dataType = (settings.dataType || defaultSettings.dataType || 'json').toLowerCase();
        }
        
        // blend defaultSettings with defaults
        if (!core.isEmpty(defaultSettings)) {
            var compositeSettings = core.extend({}, this.defaultSettings); // clone defaults
            core.extend(compositeSettings, settings); // override defaults with adapterSettings
            return compositeSettings;
        } 
        return settings;
    }
    

    function jqSend(settings) {
        var jqXHR = jqAjax(settings);
        
        var promise = Q.when(jqXHR).then(succeeded).fail(failed);
        
        // Todo: test this in various browsers
        if (jqXHR.abort) {
            promise.abort = function () {
                try {
                    jqXHR.abort(); // should trigger fail  
                } catch (e) { /* eat it */}
            }; 
        } 
        
        return promise;

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
        
        function makeAdapterResponse(data, textStatus, xhr) {
            cleanup(xhr);
            var adapterResponse = {
                data: data,
                status: textStatus,
                statusCode: xhr.status,
                statusCodeText: xhr.statusText,
                headers: headersGetterFromXhr(xhr),
                adapterExports: { xhr: jqXHR }
            };
            return adapterResponse;
        }
        
        // can no longer abort or listen to xhr state changes       
        function cleanup(xhr) {
            promise.abort = null;
            xhr.abort = null;
            xhr.onreadystatechange = null;
        }
    }
    
    function headersGetterFromXhr(xhr) {
        headersGetter(xhr.getAllResponseHeaders());
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
