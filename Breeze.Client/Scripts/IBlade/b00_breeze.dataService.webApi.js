(function(factory) {
    if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
        // CommonJS or Node: hard-coded dependency on "breeze"
        factory(require("breeze"));
    } else if (typeof define === "function" && define["amd"] && !breeze) {
        // AMD anonymous module with hard-coded dependency on "breeze"
        define(["breeze"], factory);
    } else {
        // <script> tag: use the global `breeze` object
        factory(breeze);
    }    
}(function(breeze) {
    
    var core = breeze.core;
    var http;
    
    var ctor = function () { this.name = "webApi"; };
    ctor.prototype.checkForRecomposition = checkForRecomposition;   
    ctor.prototype.initialize = initialize;
    ctor.prototype.jsonResultsAdapter = createJsonResultsAdapter();
    ctor.prototype.fetchMetadata = fetchMetadata;
    ctor.prototype.executeQuery = executeQuery;
    ctor.prototype.saveChanges = saveChanges;

    breeze.config.registerAdapter("dataService", ctor);

    //#region private members
    function checkForRecomposition(interfaceInitializedArgs) {
        if (interfaceInitializedArgs.interfaceName === "http" && interfaceInitializedArgs.isDefault) {
            this.initialize();
        }
    };

    function initialize() {
        http = breeze.config.getAdapterInstance("http");
        if (!http) {
            throw new Error("Unable to initialize http adapter for WebApi.");
        }
    }

    function createJsonResultsAdapter() {
        var getNormalizedTypeName = breeze.EntityType._getNormalizedTypeName;
        return new breeze.JsonResultsAdapter({

            name: "webApi_default",

            visitNode: function (node, queryContext, nodeContext) {
                var entityTypeName = getNormalizedTypeName(node.$type);
                var entityType = entityTypeName && queryContext.entityManager.metadataStore.getEntityType(entityTypeName, true);
                var propertyName = nodeContext.propertyName;
                var ignore = propertyName && propertyName.substr(0, 1) === "$";

                return {
                    entityType: entityType,
                    nodeId: node.$id,
                    nodeRefId: node.$ref,
                    ignore: ignore
                };
            },

        });
    };

    function fetchMetadata(metadataStore, dataService) {
        var serviceName = dataService.serviceName;
        var url = getMetadataUrl(serviceName);      
        var msgPrefix = "Metadata query failed for: " + url;

        return http.send({ url: url, operation: 'metadata'}).then(succeeded, failed);
        
        function succeeded(adapterResponse) {
            
            if (metadataStore.hasMetadataFor(serviceName)) {
                return Q.resolve("already fetched"); // Jay! Really?
            }

            var metadata = null;
            try {
                metadata = typeof(data) === "string" ? JSON.parse(data) : data;
            } catch (e) {/*eat it; will fail next step */ }
            
            if (!metadata) {
                return Q.reject(new Error(msgPrefix + "; received no (parsable) data."));
            }
            
            if (metadata.structuralTypeMap) {
                // breeze native metadata format.
                metadataStore.importMetadata(metadata);
            } else if (metadata.schema) {
                // OData or CSDL to JSON format
                metadataStore._parseODataMetadata(serviceName, metadata.schema);
            } else {
                return Q.reject(new Error(msgPrefix + "; unable to process returned metadata"));
            }

            metadataStore.addDataService(dataService);
            
            return Q.resolve(metadata);
        }

        function failed(adapterResponse) {
            handleAdapterFailed(adapterResponse, msgPrefix)
        }
    }

    function getMetadataUrl(serviceName) {
        var metadataSvcUrl = serviceName;
        // remove any trailing "/"
        if (core.stringEndsWith(metadataSvcUrl, "/")) {
            metadataSvcUrl = metadataSvcUrl.substr(0, metadataSvcUrl.length - 1);
        }
        // ensure that it ends with /Metadata 
        if (!core.stringEndsWith(metadataSvcUrl, "/Metadata")) {
            metadataSvcUrl = metadataSvcUrl + "/Metadata";
        }
        return metadataSvcUrl;
    }

    function executeQuery(entityManager, odataQuery) {
        var url = entityManager.serviceName + odataQuery;
        var msgPrefix = "Query failed";

        return http.send({ url: url, operation: 'query'}).then(succeeded, failed);

        function succeeded(adapterResponse) {
            try {
                var inlineCount = adapterResponse.headers("X-InlineCount");
                if (inlineCount) {
                    inlineCount = parseInt(inlineCount, 10);
                }
                return Q.resolve({
                    results: data,
                    inlineCount: inlineCount,
                    adapterExports: adapterResponse.adapterExports
                });
            } catch (e) {
                return Q.reject(msgPrefix + " during response processing; " + (e && e.message));
            }
        }

        function failed(adapterResponse) {
            handleAdapterFailed(adapterResponse, msgPrefix)
        }
    }

    function saveChanges(entityManager, saveResourceName, saveBundleStringified) {
        var url = entityManager.serviceName + (saveResourceName || "SaveChanges");
        var msgPrefix = "Save failed";

        return http.send({ url: url, operation: 'savechanges' }).then(succeeded, failed);

        function succeeded(adapterResponse) {
            var data = adapterResponse.data;
            if (data.error) {
                var err = createError(adapterResponse);
                err.message = data.Error;
                return Q.rejected(err);
            } else {
                data.adapterExports = adapterResponse.adapterExports;
                return Q.resolved(data);
            }
        }

        function failed(adapterResponse) {
            handleAdapterFailed(adapterResponse, msgPrefix)
        }
    }

    function handleAdapterFailed(adapterResponse, msgPrefix) {
        var error = createError(adapterResponse);
        if (msgPrefix) {
            error.message = errMsg + "; " + error.message;
        }
        return Q.reject(error)
    }

    function createError(adapterResponse) {
        var err = new Error();
        err.adapterExports = adapterResponse.adapterExports;
        err.status = adapterResponse.statusCode;
        err.statusText = adapterResponse.statusCodeText;
        err.message = adapterResponse.statusCodeText || adapterResponse.statusText;
        err.responseText = adapterResponse.data;
        if (err.responseText) {
            try {
                var responseObj = JSON.parse(err.responseText);
                err.detail = responseObj;
                var source = responseObj.InnerException || responseObj;
                err.message = source.ExceptionMessage || source.Message || err.responseText;
            } catch (e) {/* eat it; use what we've got */ }
        }
        return err;
    }

    //#endregion

    //#region deprecated ajax implementation
    var ajaxImpl; // remove

    function checkForAjaxRecomposition(interfaceInitializedArgs) {
        if (interfaceInitializedArgs.interfaceName === "ajax" && interfaceInitializedArgs.isDefault) {
            this.initialize();
        }
    }
    function initializeAjax() {
        ajaxImpl = breeze.config.getAdapterInstance("ajax");

        if (!ajaxImpl) {
            throw new Error("Unable to initialize ajax for WebApi.");
        }

        // don't cache 'ajax' because we then we would need to ".bind" it, and don't want to because of brower support issues. 
        var ajax = ajaxImpl.ajax;
        if (!ajax) {
            throw new Error("Breeze was unable to find an 'ajax' adapter");
        }
    }

    function ajaxFetchMetadata(metadataStore, dataService, callback, errorCallback) {
        var serviceName = dataService.serviceName;
        var metadataSvcUrl = getMetadataUrl(serviceName);
        ajaxImpl.ajax({
            url: metadataSvcUrl,
            dataType: 'json',
            success: function (data, textStatus, XHR) {
                // might have been fetched by another query
                if (metadataStore.hasMetadataFor(serviceName)) {
                    callback("already fetched");
                    return;
                }
                var metadata = typeof (data) === "string" ? JSON.parse(data) : data;

                if (!metadata) {
                    if (errorCallback) errorCallback(new Error("Metadata query failed for: " + metadataSvcUrl));
                    return;
                }

                if (metadata.structuralTypeMap) {
                    // breeze native metadata format.
                    metadataStore.importMetadata(metadata);
                } else if (metadata.schema) {
                    // OData or CSDL to JSON format
                    metadataStore._parseODataMetadata(serviceName, metadata.schema);
                } else {
                    if (errorCallback) {
                        errorCallback(new Error("Metadata query failed for " + metadataSvcUrl + "; Unable to process returned metadata"));
                    }
                    return;
                }

                // import may have brought in the service.
                if (!metadataStore.hasMetadataFor(serviceName)) {
                    metadataStore.addDataService(dataService);
                }

                if (callback) {
                    callback(metadata);
                }

                XHR.onreadystatechange = null;
                XHR.abort = null;

            },
            error: function (XHR, textStatus, errorThrown) {
                handleXHRError(XHR, errorCallback, "Metadata query failed for: " + metadataSvcUrl);
            }
        });
    };

    function ajaxExecuteQuery(entityManager, odataQuery, collectionCallback, errorCallback) {

        var url = entityManager.serviceName + odataQuery;
        ajaxImpl.ajax({
            url: url,
            dataType: 'json',
            success: function (data, textStatus, XHR) {
                // jQuery.getJSON(url).done(function (data, textStatus, jqXHR) {
                try {
                    var inlineCount = XHR.getResponseHeader("X-InlineCount");

                    if (inlineCount) {
                        inlineCount = parseInt(inlineCount, 10);
                    }
                    collectionCallback({ results: data, XHR: XHR, inlineCount: inlineCount });
                    XHR.onreadystatechange = null;
                    XHR.abort = null;
                } catch (e) {
                    var error = e instanceof Error ? e : createXhrError(XHR);
                    // needed because it doesn't look like jquery calls .fail if an error occurs within the function
                    if (errorCallback) errorCallback(error);
                    XHR.onreadystatechange = null;
                    XHR.abort = null;
                }

            },
            error: function (XHR, textStatus, errorThrown) {
                handleXHRError(XHR, errorCallback);
            }
        });
    };

    function ajaxSaveChanges(entityManager, saveBundleStringified, callback, errorCallback) {
        var url = entityManager.serviceName + "SaveChanges";
        ajaxImpl.ajax({
            url: url,
            type: "POST",
            dataType: 'json',
            contentType: "application/json",
            data: saveBundleStringified,
            success: function (data, textStatus, XHR) {
                if (data.Error) {
                    // anticipatable errors on server - concurrency...
                    var err = createXhrError(XHR);
                    err.message = data.Error;
                    errorCallback(err);
                } else {
                    data.XHR = XHR;
                    callback(data);
                }
            },
            error: function (XHR, textStatus, errorThrown) {
                handleXHRError(XHR, errorCallback);
            }
        });
    };

    function handleXHRError(XHR, errorCallback, messagePrefix) {

        if (!errorCallback) return;
        var err = createXhrError(XHR);
        if (messagePrefix) {
            err.message = messagePrefix + "; " + +err.message;
        }
        errorCallback(err);
        XHR.onreadystatechange = null;
        XHR.abort = null;
    }

    function createXhrError(XHR) {
        var err = new Error();
        err.XHR = XHR;
        err.message = XHR.statusText;
        err.responseText = XHR.responseText;
        err.status = XHR.status;
        err.statusText = XHR.statusText;
        if (err.responseText) {
            try {
                var responseObj = JSON.parse(XHR.responseText);
                err.detail = responseObj;
                var source = responseObj.InnerException || responseObj;
                err.message = source.ExceptionMessage || source.Message || XHR.responseText;
            } catch (e) {

            }
        }
        return err;
    }
    //#endregion


}));