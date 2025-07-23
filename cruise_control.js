// ==UserScript==
// @name        Internet Roadtrip Cruise Control
// @namespace   spideramn.github.io
// @match       https://neal.fun/internet-roadtrip/*
// @version     0.0.1
// @author      Spideramn
// @description Internet Roadtrip Cruise Control.
// @license     MIT
// @grant       GM.addStyle
// @grant       GM.setValues
// @grant       GM.getValues
// @icon        https://neal.fun/favicons/internet-roadtrip.png
// @require     https://cdn.jsdelivr.net/npm/internet-roadtrip-framework@0.4.1-beta
// @require     https://cdnjs.cloudflare.com/ajax/libs/gauge.js/1.3.9/gauge.min.js
// ==/UserScript==

// This works together with irf.d.ts to give us type hints
/* globals IRF Gauge */
/**
  * Internet Roadtrip Framework
  * @typedef {typeof import('internet-roadtrip-framework')} IRF
  */

(async function() {

    if (!IRF?.isInternetRoadtrip) {
        return;
    }

    // Get map methods and various objects
    const odometer = await IRF.vdom.odometer;
    const container = await IRF.vdom.container;

    class cruiseControl
    {
        async setup()
        {
            container.state.changeStop = new Proxy(container.methods.changeStop, {
                apply: async (target, thisArg, args) => {
                    const returnValue = Reflect.apply(target, thisArg, args);
                    this._changeStop(args[5]);
                    return returnValue;
                }
            });
        };

        _changeStop(stops)
        {
            if(settings.cruise_control_enabled)
            {
                // only 1 option to choose from?
                if(stops.length == 1)
                {
                    setTimeout(async () => this._vote(), 1000);
                }
                else
                {
                    console.log('Not voting, there are ' + stops.length + ' options.');
                }
            }
        }

        async _vote()
        {
            // already voted?
            if(!container.data.voted)
            {
                await container.methods.vote(0); // vote
            }
        }
    };

    // Speedometer
    class speedOmeterControl
    {
        _queue = [];
        _speedOmeterContainer = undefined;
        _speedOmeterElement = undefined;
        _gauge = undefined;

        addDistance(dinstanceInMiles)
        {
            // prevent duplicate distances
            if(this._queue.length > 0)
            {
                const lastDistance = this._queue[this._queue.length - 1].distance;
                if(dinstanceInMiles == lastDistance)
                {
                    this.update();
                    return;
                }
            }

            this._queue.push({time: Date.now(), distance: dinstanceInMiles});
            if (this._queue.length > 15)
            {
                this._queue.shift();
            }
            this.update();
        };

        async setup()
        {
            GM.addStyle(`
.speedOmeterContainer {
	width: 70%;
	height: 25%;
	position: absolute;
	top: 10%;
	left: 15%;
}
.speedOmeterContainer canvas{
    position: absolute;
    width: 100%;
    height: 100%;
}
.speedOmeterContainer span {
	position: absolute;
	width: 100%;
	bottom: 0%;
	left: 0%;
	height: 50%;
	text-align: center;
	font-family: Roboto,sans-serif;
    color: #1F1F1F;
    font-size: 17px;
}
`);

            // add dom elements
            this._speedOmeterContainer = document.createElement('div');
            this._speedOmeterContainer.className = "speedOmeterContainer";
            const speedOmeterCanvas = document.createElement('canvas');
            this._speedOmeterElement = document.createElement('span');
            this._speedOmeterContainer.appendChild(speedOmeterCanvas);
            this._speedOmeterContainer.appendChild(this._speedOmeterElement);
            (await IRF.dom.wheel).prepend(this._speedOmeterContainer);

            var opts = {
                angle: 0,
                lineWidth: 1,
                radiusScale: 1,
                pointer: {
                    length: 1,
                    strokeWidth: 0.035,
                    color: '#AA000099'
                },
                limitMax: true,
                limitMin: true,
                generateGradient: false,
                highDpiSupport: true,
                colorStart: '#FFFFFF99',
                colorStop: '#FFFFFF99',
                strokeColor: '#FFFFFF99',
                // renderTicks is Optional
                renderTicks: {
                    divisions: 6,
                    divWidth: 2,
                    divLength: 0.1,
                    divColor: '#333333',
                    subDivisions: 5,
                    subLength: 0.05,
                    subWidth: 1,
                    subColor: '#666666'
                },
                staticLabels: {
                    font: "10px Roboto,sans-serif",
                    labels: [0, 5, 10, 15, 20, 25, 30],
                    color: "#000000",
                    fractionDigits: 0
                }
            };
            this._gauge = new Gauge(speedOmeterCanvas).setOptions(opts);
            this._gauge.maxValue = 30;
            this._gauge.set(0); // set actual value

            // set hook
            odometer.state.updateDisplay = new Proxy(odometer.methods.updateDisplay, {
                apply: (target, thisArg, args) => {
                    this.addDistance(odometer.props.miles);
                    return Reflect.apply(target, thisArg, args);;
                },
            });

        }

        update()
        {
            if(settings.speedometer_enabled)
            {
                this._speedOmeterContainer.style.visibility = 'visible';

                if(this._queue.length < 3)
                {
                    this._gauge.set(0);
                    this._speedOmeterElement.innerText = 'Calibrating...';
                    return;
                }

                const totalDistance = this._queue[this._queue.length - 1].distance - this._queue[0].distance;
                const totalTime = this._queue[this._queue.length - 1].time - this._queue[0].time;
                const totalTimeInHours = totalTime / (1000 * 60 * 60);
                let speed = totalDistance / totalTimeInHours; // mph
                if(odometer.data.isKilometers)
                {
                    speed *= odometer.data.conversionFactor;
                }
                this._gauge.set(speed);
                this._speedOmeterElement.innerText = (speed.toFixed(1) + (odometer.data.isKilometers? ' km/h' : ' mph'));
            }
            else
            {
                this._gauge.set(0);
                this._speedOmeterElement.innerText = '';
                this._speedOmeterContainer.style.visibility = 'hidden';
            }
        }
    };

    //
    // Settings
    const settings = {
        "cruise_control_enabled": false,
        "speedometer_enabled": false,
    };
    const storedSettings = await GM.getValues(Object.keys(settings))
    Object.assign(settings, storedSettings);
    await GM.setValues(settings);

    // settings panel
    let gm_info = GM.info
    gm_info.script.name = "Cruise Control"
    const irf_settings = IRF.ui.panel.createTabFor(gm_info, { tabName: "Cruise Control" });
    const info_el = document.createElement("div");
    info_el.innerText = "When Cruise Control is enabled you will automatically vote if there is only 1 option available.";
    irf_settings.container.appendChild(info_el);
    irf_settings.container.appendChild(document.createElement('hr'));
    add_checkbox('Cruise control enabled', 'cruise_control_enabled');
    add_checkbox('Display speedometer', 'speedometer_enabled', (enabled) => speedOmeter.update());

    function add_checkbox(name, identifier, callback=undefined, settings_container=irf_settings.container) {
        let label = document.createElement("label");

        let checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = settings[identifier];
        checkbox.className = IRF.ui.panel.styles.toggle;
        label.appendChild(checkbox);

        let text = document.createElement("span");
        text.innerText = " " + name;
        label.appendChild(text);

        checkbox.addEventListener("change", () => {
            settings[identifier] = checkbox.checked;
            GM.setValues(settings);
            if (callback) callback(checkbox.checked);
        });

        settings_container.appendChild(label);
        settings_container.appendChild(document.createElement("br"));
        settings_container.appendChild(document.createElement("br"));

        return checkbox
    };

    const speedOmeter = new speedOmeterControl();
    await speedOmeter.setup();

    const cruiseControlInstance = new cruiseControl();
    await cruiseControlInstance.setup();
})();