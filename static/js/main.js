var c = new fabric.Canvas('c'),
    cEl = $(c.upperCanvasEl)
c.setWidth(1000)
c.setHeight(500)

gates = {}
wires = []

var uid = 100

gate_types = {
    'and': {
        args: 2,
        make_shape: function(x, y) {
            return new fabric.Triangle({
                top: y,
                left: x,
                fill: 'red',
                width: 50,
                height: 50,
                angle: 90,
                hasControls: false
            })
        }
    }
}

function get_by_id(id) {
    if (gates.hasOwnProperty(id))
        return gates[id]
}


function calc_input_pos(g, input_num) {
    var spaces = gate_types[g.type].args + 1,
        space_height = g.shape.height / spaces
    return {
        x: g.shape.left - g.shape.width / 2,
        y: g.shape.top - g.shape.height / 2 + space_height * input_num
    }
}

function calc_output_pos(g) {
    return {
        x: g.shape.left + g.shape.width / 2,
        y: g.shape.top //+ g.shape.height / 2
    }
}

function create_wire_shape(w) {
    var bgn_coords = calc_output_pos(w.begin),
        end_coords = calc_input_pos(w.end, 1)
    return new fabric.Line([ bgn_coords.x, bgn_coords.y, end_coords.x, end_coords.y ], {
        fill: 'black',
        stroke: 'black',
        strokeWidth: 5,
        selectable: false
    })
}

function create_wire(g1, g2) {
    w = {
        begin: g1,
        end: g2,
    }
    w.shape = create_wire_shape(w)
    wires.push(w)
    return w
}

function update_wires() {
    for (var i = wires.length - 1; i >= 0; i--) {
        var w = wires[i]
        if (!gates.hasOwnProperty(w.begin.id) || !gates.hasOwnProperty(w.end.id)) {
            console.log('delete wire')
            wires.pop(i)
        } else {
            if (w.shape) {
                c.remove(w.shape)
            }
            w.shape = create_wire_shape(w)
            c.add(w.shape)
        }
    };
}

function update() {
    update_wires()
    c.renderAll()
    fabric.util.requestAnimFrame(update, c.upperCanvasEl)
}
fabric.util.requestAnimFrame(update, c.upperCanvasEl)

function create_gate(type, x, y) {
    var g = {
        id: uid++,
        type: type,
        shape: gate_types[type].make_shape(x, y),
    }
    gates[g.id] = g
    c.add(g.shape)
    return g
}

