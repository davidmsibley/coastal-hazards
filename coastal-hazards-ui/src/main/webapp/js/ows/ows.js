var OWS = function(endpoint) {
    var me = (this === window) ? {} : this;
    
    me.importEndpoint = 'service/import'
    me.geoserverEndpoint = endpoint ? endpoint : CONFIG.geoServerEndpoint;
    me.wfsGetCapsUrl = 'geoserver/ows?service=wfs&version=1.1.0&request=GetCapabilities'
    me.wfsGetFeature = 'geoserver/ows?service=wfs&version=1.1.0&request=GetFeature'
    me.wfsDescribeFeatureTypeEndpoint = 'geoserver/ows?service=wfs&version=2.0.0&request=DescribeFeatureType'
    me.wfsCapabilities = null;
    me.wfsCapabilitiesXML = null;
    me.wmsGetCapsUrl = 'geoserver/ows?service=wms&version=1.3.0&request=GetCapabilities'
    me.wmsCapabilities = null;
    me.wmsCapabilitiesXML = null;
    me.wpsExecuteRequestPostUrl = 'geoserver/ows?service=wps&version=1.0.0&request=execute'
    
    // An object to hold the return from WFS DescribeFeatureType
    me.featureTypeDescription = Object.extended();
    
    // An object to hold the return of a filtered WFS getFeature response
    me.filteredFeature = Object.extended();
    
    return $.extend(me, {
        /**
         * Imports file into GeoServer from the upload area
         */
        importFile : function(args) {
            LOG.info('OWS.js::importFile: Importing file into OWS resource');
            $.ajax(me.importEndpoint,{
                context : args.context || this,
                data : {
                    'file-token': args['file-token'],
                    'feature-name' : args.importName,
                    'workspace' : args.workspace
                },
                success : function(data, textStatus, jqXHR) {
                    var scope = this;
                    $(args.callbacks).each(function(index, callback, allCallbacks) {
                        callback(data, scope);
                    })
                }
            });
        },
        getWMSCapabilities : function(args) {
            $.ajax(me.wmsGetCapsUrl, {
                context: args,
                success : function(data, textStatus, jqXHR) {
                    var getCapsResponse = new OpenLayers.Format.WMSCapabilities.v1_3_0().read(data); 
                    me.wmsCapabilities = getCapsResponse;
                    me.wmsCapabilitiesXML = data;
                    $(args.callbacks.success).each(function(index, callback, allCallbacks) {
                        callback(getCapsResponse, args);
                    })
                }
            })
        },
        getWFSCapabilities : function(args) {
            $.ajax(me.wfsGetCapsUrl, {
                context: args,
                success : function(data, textStatus, jqXHR) {
                    var getCapsResponse = new OpenLayers.Format.WFSCapabilities.v1_1_0().read(data); 
                    me.wfsCapabilities = getCapsResponse;
                    me.wfsCapabilitiesXML = data;
                    $(args.callbacks).each(function(index, callback, allCallbacks) {
                        callback(getCapsResponse, this);
                    })
                }
            })
        },
        getFeatureByName : function(name) {
            return me.wfsCapabilities.featureTypeList.featureTypes.find(function(featureType) {
                return featureType.name === name;
            })
        },
        getLayerByName : function(name) {
            return me.wmsCapabilities.capability.layers.find(function(layer) {
                return layer.name === name;
            })
        },
        getLayerPropertiesFromWFSDescribeFeatureType : function(args) {
            LOG.info('OWS.js::getLayerPropertiesFromWFSDescribeFeatureType');
            LOG.debug('OWS.js::getLayerPropertiesFromWFSDescribeFeatureType: Parsing WFS describe feature type response for properties');
            
            var describeFeatureType = args.describeFeatureType;
            var includeGeom = args.includeGeom;
            var result = new Object.extended();
            
            LOG.debug('OWS.js::getLayerPropertiesFromWFSDescribeFeatureType: Will attempt to parse ' + describeFeatureType.featureTypes.length + ' layers');
            $(describeFeatureType.featureTypes).each(function(i, featureType) {
                        
                // For each layer, initilize a property array for it in the result object
                result[featureType.typeName] = [];
                        
                LOG.trace('OWS.js::getLayerPropertiesFromWFSDescribeFeatureType: Will attempt to parse ' + featureType.properties.length+ ' layer properties');
                $(featureType.properties).each(function(i,property) {
                
                    if (!includeGeom) {
                        // Pulling down geometries is not required and can make the document huge 
                        // So grab everything except the geometry object(s)
                        if (property.type != "gml:MultiLineStringPropertyType" && property.type != "gml:MultiCurvePropertyType" && property.name != 'the_geom') {
                            result[featureType.typeName].push(property.name);
                        }
                    } else {
                        result[featureType.typeName].push(property.name);
                    }
                })
            })
            return result;
        },
        getDescribeFeatureType : function(args) {
            LOG.info('OWS.js::getDescribeFeatureType: WFS featureType requested for feature ' + args.featureName);
            var url = me.wfsDescribeFeatureTypeEndpoint + '&typeName=' + args.featureName;
            $.ajax(url, {
                context : args.scope || this,
                success : function(data, textStatus, jqXHR) {
                    LOG.info('OWS.js::getDescribeFeatureType: WFS featureType response received.');
                    var gmlReader = new OpenLayers.Format.WFSDescribeFeatureType();
                    var describeFeaturetypeRespone = gmlReader.read(data); 
                    
                    me.featureTypeDescription[describeFeaturetypeRespone.featureTypes[0].typeName] = describeFeaturetypeRespone;
                    
                    $(args.callbacks || []).each(function(index, callback) {
                        callback(describeFeaturetypeRespone, this);
                    })
                }
            })
        },
        getFilteredFeature : function(args) {
            LOG.info('OWS.js::getFilteredFeature');
            LOG.info('OWS.js::getFilteredFeature: Building request for WFS GetFeature (filtered)');
            var layer = args.layer;
            var url = me.wfsGetFeature + '&typeName=' + layer.name + '&propertyName=';
            url += (args.propertyArray || []).join(',');
            
            $.ajax(url, {
                context : args.scope || this,
                success : function(data, textStatus, jqXHR) {
                    LOG.trace('OWS.js::getFilteredFeature: Successfully received WFS GetFeature response.');
                    var gmlReader = new OpenLayers.Format.GML.v3();
                    var getFeatureResponse = gmlReader.read(data); 
                    LOG.debug('OWS.js::getFilteredFeature: WFS GetFeature parsed .');
                    
                    me.featureTypeDescription[args.layer.name] = getFeatureResponse;
                    
                    LOG.trace('OWS.js::getFilteredFeature: Executing '+args.callbacks.success+'callbacks');
                    $(args.callbacks.success || []).each(function(index, callback, allCallbacks) {
                        LOG.trace('OWS.js::getFilteredFeature: Executing callback ' + index);
                        callback(getFeatureResponse, this);
                    })
                },
                error : function(data, textStatus, jqXHR) {
                    $(args.callbacks.error || []).each(function(index, callback, allCallbacks) {
                        callback(data, this);
                    })
                }
            })
        },
        updateFeatureTypeAttribute : function(featureType, attribute, value, callback) {

            var updateTransaction =
            '<?xml version="1.0"?>' +
            '<wfs:Transaction xmlns:ogc="http://www.opengis.net/ogc" ' +
            'xmlns:wfs="http://www.opengis.net/wfs" ' +
            'xmlns:gml="http://www.opengis.net/gml" ' +
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
            'version="1.1.0" service="WFS" '+
            'xsi:schemaLocation="http://www.opengis.net/wfs ../wfs/1.1.0/WFS.xsd">' +
            '<wfs:Update typeName="' + featureType + '">' +
            '<wfs:Property>' +
            '<wfs:Name>' + attribute + '</wfs:Name>' +
            '<wfs:Value>' + value + '</wfs:Value>'+
            '</wfs:Property>'+
            '</wfs:Update>'+
            '</wfs:Transaction>';

            $.ajax({
                url: 'geoserver/ows/',
                type: 'POST',
                contentType: 'application/xml',
                data: updateTransaction,
                success: function(data, textStatus, jqXHR) {
                    callback(data);
                }
            });
        },
        executeWPSProcess : function(args) {
            LOG.info('OWS.js::executeWPSProcess: Calling WPS execute process');
            var processIdentifier = args.processIdentifier;
            var processUrl = this.wpsExecuteRequestPostUrl + '&' + processIdentifier;
            var request = args.request;
            var callbacks = args.callbacks || [];
            var context = args.context || this;
            
            $.ajax({
                url: processUrl,
                type: 'POST',
                contentType: 'application/xml',
                data: request,
                context : context || this,
                success: function(data, textStatus, jqXHR) {
                    callbacks.each(function(callback) {
                        callback(data, textStatus, jqXHR, this);
                    })
                },
                error: function(data, textStatus, jqXHR) {
                    callbacks.each(function(callback) {
                        callback(data, textStatus, jqXHR, this);
                    })
                }
            });
            
        }
    });
}