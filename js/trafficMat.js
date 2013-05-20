(function(ns, $, google) {

    if ( !(window.localStorage != null && typeof window.localStorage == "object") ) {  // abort immediately if localStorage unsupported
        window.alert("Your browser does not support local storage. Please upgrade.")
        console.log("Local Storage is not supported. Aborting.")
        return null
    }

    var

    target_id,


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
                this.handle.panTo(this.center);  // Always try returning to center - does nothing if already centered
                if ( this.zoom != this.handle.getZoom() ) {  // Redraws whole map - only try if zoom has changed
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
                if (timeLimit <= 5) $("#message").html("Recentering in " + timeLimit + "s...");  // silent delays over 5 seconds
                this.timer = window.setTimeout(function () { map.snapBack(timeLimit-1) }, 1000);  // 1 second delay
            } else if ( timeLimit == 0 ) {
                this.drawMap();
                resetTimer();  // Needed to clear the countdown message from the screen
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

            google.maps.event.clearInstanceListeners(this.handle);  // clear all previously attached listeners
            google.maps.event.addListener(this.handle, "idle", idleListener);
            google.maps.event.addListener(this.handle, "drag", resetTimer);
            google.maps.event.addListener(this.handle, "zoom_changed", resetTimer);

            // should handle mobile tilt
            google.maps.event.addListener(this.handle, "resize", function() { map.drawMap(); });  
            if ( $.browser.mobile ) {
                window.addEventListener("orientationchange", function () { map.drawMap(); }, false );
            }

        }
    },


    marker = {  // Handles drawing the GPS marker on the map
        draw: function (location) {
            if (this.handle) this.handle.setMap(null);  // clear the marker from the map if already defined

            var options = {
                draggable: true,
                raiseOnDrag: true,
                visible: true,
                position: location,
                map: map.handle
            };

            this.handle = new google.maps.Marker(options);
        }
    },
    

    gpsLocation = {  // use HTML5 geolocation to get device position - callbacks are asynchronous

        glOptions: {
            enableHighAccuracy: true,
            timeout: 10000,  // default 10s timeout
            maximumAge: 0  // 0 minute update cycle
        },


        locationFound: function (position) {  // called when HTML5 geolocation succeeds
            console.log("Geolocation success");
            var location = new google.maps.LatLng(position.coords.latitude,
                                                  position.coords.longitude);
            if ( !map.isSaved && !marker.handle ) {
                map.center = location;
                map.zoom = 11;
                map.initialize();
            }

            if ( !this.timestamp || position.timestamp - this.timestamp >= 250000 ) {  // only draw the marker if it's a few minutes old
                this.timestamp = position.timestamp;
                marker.draw(location);
            }
        },


        locationError: function (error) {  // called when HTML5 geolocation fails
            var errors = { 
                1: 'Permission denied',
                2: 'Position unavailable',
                3: 'Request timeout'
            };
            console.log("  displayError(): " + errors[error.code]);
        },


        getPosition: function () { 
            navigator.geolocation.getCurrentPosition(gpsLocation.locationFound,
                                                     gpsLocation.locationError, 
                                                     gpsLocation.glOptions);
        },


        initialize: function () {
            this.getPosition();  // needs to be called before the interval timer is started
            this.handle = setInterval(this.getPosition, 300000);  // update every 5 minutes
        }
    };


    monitorLockButton = function () {
        $(function () {  // Must wrap in a jQuery anonymous function to get jQuery-ui inside the library
            
            $( "#action" ).unbind();  // Disable all callback events

            if ( map.isSaved && map.isStatic ) {
                $( "#action" ).button( { label: "Unlock" } )
                $( "#action" ).click( function (event, ui) {  // click this to unlock the map
                    console.log("Clearing location & zoom; switching to 'lock'.");
                    localStorage.removeItem("lat");
                    localStorage.removeItem("lng");
                    localStorage.removeItem("zoom");
                    monitorLockButton();
                    resetTimer();
                });
            } else {
                $( "#action" ).button( { label: "Lock" } )
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


    idleListener = function () {
        resetTimer();
        monitorLockButton();
        if ( map.isSaved && !map.isStatic ) map.snapBack(7);
    },


    resetTimer = function () {
        map.timer = ( !map.timer ? null : window.clearTimeout(map.timer));  // reset the timer
        $( "#message" ).html("");
    },


    // Initialize the app

    // Draw UI buttons & bind refresh button callback
    $(function() { $( "#refresh" ).button( { label: "Refresh" } ); } ); // has to be wrapped in a jQuery anon function
    $(function() { $( "#action" ).button( { label: "Unlock" } ); } ); // has to be wrapped in a jQuery anon function
    $(function() { $( "#refresh" ).click( function (event, ui) { 
            map.drawTraffic();
        })
    });

    // Need public method to initialize the app using "body onload"; otherwise id=map_canvas doesn't exist & causes error
    ns.trafficMat = {
        
        initialize: function (target_id) { 
            if ("geolocation" in navigator) {  // Attempt geolocation
                gpsLocation.initialize();
            }

            map.initialize(target_id);
        }
    };

})(this, jQuery, google);