(function(ns, $, google) {

    if ( !(window.localStorage != null && typeof window.localStorage == "object") ) {  // abort immediately if localStorage unsupported
        window.alert("Your browser does not support local storage. Please upgrade.")
        console.log("Local Storage is not supported. Aborting.")
        return null
    }

    var

    target_id,

    ui_buttons = {
        lock: { label: "Lock" },
        unlock: { label: "Unlock" },
        refresh: { label: "Refresh" }
    },

    monitorLockButton = function () {
        $(function () {  // Must wrap in a jQuery anonymous function to get jQuery-ui inside the library
            
            $( "#action" ).unbind();  // Disable all callback events

            if ( map.isSaved && map.isStatic ) {
                $( "#action" ).button( ui_buttons.unlock )
                $( "#action" ).click( function (event, ui) {  // click this to unlock the map
                    console.log("Clearing location & zoom; switching to 'lock'.");
                    localStorage.removeItem("lat");
                    localStorage.removeItem("lng");
                    localStorage.removeItem("zoom");
                    monitorLockButton();
                    resetTimer();
                });
            } else {
                $( "#action" ).button( ui_buttons.lock )
                $( "#action" ).click( function (event, ui) {  // click this to lock the map
                    console.log("Saving location & zoom; switching button to 'unlock'.");
                    map.center = map.handle.getCenter();
                    map.zoom = map.handle.getZoom();
                    localStorage.setItem("lat", map.center.lat());
                    localStorage.setItem("lng", map.center.lng());
                    localStorage.setItem("zoom", map.zoom);
                    monitorLockButton();
                    resetTimer();
                });
            }
        });
    },

    map = {

        distanceBetween: google.maps.geometry.spherical.computeDistanceBetween,  // its a long name - shorten it

        get isSaved () { return (localStorage.getItem("lat") ? true : false); },
        
        get isStatic () {  // test whether the map is at the saved zoom/center configuration
            if ( this.handle && this.center ) {
                var 
                dist = this.distanceBetween(this.handle.getCenter(), this.center)/1000,  // convert to km
                zoom = this.handle.getZoom();
                if ( (this.zoom == this.handle.getZoom()) && dist < 5 ) return true; 
            }
            return false;
        },

        load: function () {
            var 
            lat = JSON.parse(localStorage.getItem("lat")),
            lng = JSON.parse(localStorage.getItem("lng"));

            this.center = new google.maps.LatLng(lat,lng);
            this.zoom = JSON.parse(localStorage.getItem("zoom"));
        },

        drawMap: function () {
            var options = {  
                center: this.center,
                zoom: this.zoom,
                maxZoom: 17,
                minZoom: 4,
                mapTypeId: google.maps.MapTypeId.ROADMAP
            };
            if ( !this.handle ) {
                this.handle = new google.maps.Map(window.document.getElementById(this.target_id), options);    
            } else {
                this.handle.panTo(this.center);
                if ( this.zoom != this.handle.getZoom() ) {
                    this.handle.setZoom(this.zoom);
                }
            }
        },

        drawTraffic: function () {
            this.trafficLayer = new google.maps.TrafficLayer();
            this.trafficLayer.setMap(this.handle);
        },

        snapBack: function (timeLimit) {
            if ( timeLimit > 0 && !this.isStatic ) {
                $("#message").html("Recentering in " + timeLimit + "s...");
                this.timer = window.setTimeout(function () { map.snapBack(timeLimit-1) }, 1000);  // 1 second delay
            } else if ( timeLimit == 0 ) {
                this.handle.setZoom(map.zoom);
                this.handle.panTo(map.center);
                resetTimer();
            }
            return false;
        },

        initialize: function (target_id) {
            this.target_id = this.target_id || target_id;
            if ( this.isSaved ) {
                this.load();
            }
            // set default values if undefined or wrong type
            if ( typeof this.center !== typeof new google.maps.LatLng() ) {
                this.center =  new google.maps.LatLng(40, -98);
            }
            this.zoom = this.zoom || 5;
            this.drawMap();
            this.drawTraffic();

            google.maps.event.addListener(this.handle, "idle", idleListener);
            google.maps.event.addListener(this.handle, "drag", resetTimer);
            google.maps.event.addListener(this.handle, "zoom_changed", resetTimer);

        }
    },

    idleListener = function () {
        resetTimer();
        monitorLockButton();
        if ( map.isSaved && !map.isStatic ) map.snapBack(10);
    },

    resetTimer = function () {
        map.timer = ( !map.timer ? null : window.clearTimeout(map.timer));  // reset the timer
        $( "#message" ).html("");
    },

    marker = {
        draw: function (location) {
            if (this.handle) this.handle.setMap(null);  // clear the marker from the map if already defined

            var options = {
                draggable: false,
                raiseOnDrag: false,
                visible: true,
                position: location,
                map: map.handle
            };

            this.handle = new google.maps.Marker(options);
        }
    },

    watchPosition = function () {  // use HTML5 geolocation to get device position - callbacks are asynchronous
        var
        glOptions = {
            enableHighAccuracy: true,
            timeout: 10000,  // default 10s timeout
            maximumAge: 300000  // 5 minute update cycle
        },
        locationFound = function(position) {  // called when HTML5 geolocation succeeds
            console.log("Geolocation success");
            var location = new google.maps.LatLng(position.coords.latitude,
                                                      position.coords.longitude);
            if ( !map.isSaved && !marker.handle ) {
                map.center = location;
                map.zoom = 11;
                map.initialize();
            }

            marker.draw(location);
        },
        locationError = function (error) {  // called when HTML5 geolocation fails
            var errors = { 
                1: 'Permission denied',
                2: 'Position unavailable',
                3: 'Request timeout'
            };
            console.log("  displayError(): " + errors[error.code]);
        },
        watchID = navigator.geolocation.watchPosition( locationFound,
                                                       locationError, 
                                                       glOptions);
        return watchID;  // Return the UID of the watch process; the UID is needed to kill the process
    };

    // Initialize the app

    // Start drawing the UI & bind refresh callback
    $(function() { $( "#refresh" ).button(ui_buttons.refresh); } ); // has to be wrapped in a jQuery anon function
    $(function() { $( "#action" ).button(ui_buttons.unlock); } ); // has to be wrapped in a jQuery anon function
    $(function() { $( "#refresh" ).click( function (event, ui) { 
            map.drawTraffic();
        })
    });

    // Initialize geolocation when app first loads - helps tolerate response delay
    if ("geolocation" in navigator) { 
        watchID = watchPosition();
    }

    // Need public method to initialize the app using "body onload"; otherwise map_canvas id doesn't exist & causes error
    ns.trafficMat = {
        initialize: function (target_id) { 
            map.initialize(target_id);
        }
    };

})(this, jQuery, google);