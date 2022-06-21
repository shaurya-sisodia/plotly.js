'use strict';

var Registry = require('../../registry');

var readPaths = require('../shapes/draw_newshape/helpers').readPaths;
var displayOutlines = require('../shapes/draw_newshape/display_outlines');

var clearOutlineControllers = require('./handle_outline').clearOutlineControllers;

var Color = require('../color');
var Drawing = require('../drawing');
var arrayEditor = require('../../plot_api/plot_template').arrayEditor;

var helpers = require('../shapes/helpers');
var getPathString = helpers.getPathString;


// Selections are stored in gd.layout.selections, an array of objects
// index can point to one item in this array,
//  or non-numeric to simply add a new one
//  or -1 to modify all existing
// opt can be the full options object, or one key (to be set to value)
//  or undefined to simply redraw
// if opt is blank, val can be 'add' or a full options object to add a new
//  annotation at that point in the array, or 'remove' to delete this one

module.exports = {
    draw: draw,
    drawOne: drawOne,
    eraseActiveSelection: eraseActiveSelection
};

function draw(gd) {
    var fullLayout = gd._fullLayout;

    // Remove previous selections before drawing new selections in fullLayout.selections
    fullLayout._selectionLayer.selectAll('path').remove();

    for(var k in fullLayout._plots) {
        var selectionLayer = fullLayout._plots[k].selectionLayer;
        if(selectionLayer) selectionLayer.selectAll('path').remove();
    }

    for(var i = 0; i < fullLayout.selections.length; i++) {
        drawOne(gd, i);
    }
}

function drawOne(gd, index) {
    // remove the existing selection if there is one.
    // because indices can change, we need to look in all selection layers
    gd._fullLayout._paperdiv
        .selectAll('.selectionlayer [data-index="' + index + '"]')
        .remove();

    var o = helpers.makeSelectionsOptionsAndPlotinfo(gd, index);
    var options = o.options;
    var plotinfo = o.plotinfo;

    // this selection is gone - quit now after deleting it
    // TODO: use d3 idioms instead of deleting and redrawing every time
    if(!options._input) return;

    drawSelection(gd._fullLayout._selectionLayer);

    function drawSelection(selectionLayer) {
        var d = getPathString(gd, options);
        var attrs = {
            'data-index': index,
            'fill-rule': options.fillrule,
            d: d
        };

        var opacity = options.opacity;
        var fillColor = 'rgba(0,0,0,0)';
        var lineColor = options.line.color || Color.contrast(gd._fullLayout.plot_bgcolor);
        var lineWidth = options.line.width;
        var lineDash = options.line.dash;
        if(!lineWidth) {
            // ensure invisible border to activate the selection
            lineWidth = 5;
            lineDash = 'solid';
        }

        var isOpen = d[d.length - 1] !== 'Z';

        var isActiveSelection =
            gd._fullLayout._activeSelectionIndex === index;

        if(isActiveSelection) {
            fillColor = isOpen ? 'rgba(0,0,0,0)' :
                gd._fullLayout.activeselection.fillcolor;

            opacity = gd._fullLayout.activeselection.opacity;
        }

        var path = selectionLayer.append('path')
            .attr(attrs)
            .style('opacity', opacity)
            .call(Color.stroke, lineColor)
            .call(Color.fill, fillColor)
            .call(Drawing.dashLine, lineDash, lineWidth);

        setClipPath(path, gd, options);

        if(isActiveSelection) {
            var editHelpers = arrayEditor(gd.layout, 'selections', options);

            path.style({
                'cursor': 'move',
            });

            var dragOptions = {
                element: path.node(),
                plotinfo: plotinfo,
                gd: gd,
                editHelpers: editHelpers,
                isActiveSelection: true // i.e. to enable controllers
            };

            var polygons = readPaths(d, gd);
            // display polygons on the screen
            displayOutlines(polygons, path, dragOptions);
        } else {
            path.style('pointer-events', 'stroke');
        }

        path.node().addEventListener('click', function() { return activateSelection(gd, path); });
    }
}

function setClipPath(selectionPath, gd, selectionOptions) {
    var clipAxes = selectionOptions.xref + selectionOptions.yref;

    Drawing.setClipUrl(
        selectionPath,
        'clip' + gd._fullLayout._uid + clipAxes,
        gd
    );
}


function activateSelection(gd, path) {
    var element = path.node();
    var id = +element.getAttribute('data-index');
    if(id >= 0) {
        // deactivate if already active
        if(id === gd._fullLayout._activeSelectionIndex) {
            deactivateSelection(gd);
            return;
        }

        gd._fullLayout._activeSelectionIndex = id;
        gd._fullLayout._deactivateSelection = deactivateSelection;
        draw(gd);
    }
}

function deactivateSelection(gd) {
    var id = gd._fullLayout._activeSelectionIndex;
    if(id >= 0) {
        clearOutlineControllers(gd);
        delete gd._fullLayout._activeSelectionIndex;
        draw(gd);
    }
}

function eraseActiveSelection(gd) {
    clearOutlineControllers(gd);

    var id = gd._fullLayout._activeSelectionIndex;
    var selections = (gd.layout || {}).selections || [];
    if(id < selections.length) {
        var newSelections = [];
        for(var q = 0; q < selections.length; q++) {
            if(q !== id) {
                newSelections.push(selections[q]);
            }
        }

        delete gd._fullLayout._activeSelectionIndex;

        Registry.call('_guiRelayout', gd, {
            selections: newSelections
        });
    }
}
