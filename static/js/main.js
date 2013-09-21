var c = new fabric.Canvas('c')
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
    var spaces = gate_types[g.type].args + 1
    var space_height = g.shape.height / spaces
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

function set_wire_line_pos(w) {
    var bgn_coords = calc_output_pos(w.begin)
    var end_coords = calc_input_pos(w.end, w.input_num + 1)
    w.shape.set({ 'x1': bgn_coords.x, 'y1': bgn_coords.y, 'x2': end_coords.x, 'y2': end_coords.y })
}

function create_wire_shape(w) {
    w.shape = new fabric.Line([ 0, 0, 0, 0 ], {
        fill: 'black',
        stroke: 'black',
        strokeWidth: 5,
        selectable: false
    })
    set_wire_line_pos(w)
    c.add(w.shape)
    return w.shape
}

function create_wire(g1, g2) {
    if (g1 && g2 && g1 != g2) {
        w = {
            begin: g1,
            end: g2,
            input_num: find_number_wires(g2)
        }
        w.shape = create_wire_shape(w)
        wires.push(w)
        return w
    }
}

function find_by_shape(shape) {
    for (var id in gates) {
        if (gates.hasOwnProperty(id) && gates[id].shape == shape) {
            return gates[id]
        }
    }
}

function update_wires() {
    for (var i = wires.length - 1; i >= 0; i--) {
        var w = wires[i]
        if (!gates.hasOwnProperty(w.begin.id) || !gates.hasOwnProperty(w.end.id)) {
            console.log('delete wire')
            c.remove(wires[i].shape)
            wires.pop(i)
        } else {
            var new_input_num = find_number_wires(w.end)
            if (new_input_num < w.input_num)
                w.input_num = new_input_num
            set_wire_line_pos(w)
        }
    };
}

function update() {
    if (c.getActiveGroup() != null) {
        c.getActiveGroup().hasControls = false
    }
    update_wires()
    c.renderAll()
    fabric.util.requestAnimFrame(update, c.upperCanvasEl)
}
fabric.util.requestAnimFrame(update, c.upperCanvasEl)

function get_active() {
    if (c.getActiveObject() != null)
        return [ c.getActiveObject() ]
    else if (c.getActiveGroup() != null)
        return c.getActiveGroup().objects
    else
        return []
}

function find_wire(begin, end) {
    for (var i = wires.length - 1; i >= 0; i--) {
        if ((begin && wires[i].begin == begin) || (end && wires[i].end == end))
            return wires[i]
    }
    return null
}

function find_number_wires(end) {
    var t = 0
    for (var i = wires.length - 1; i >= 0; i--) {
        if (wires[i].end == end)
            t++
    }
    return t
}

var unfinished_wire = null
$('body').keydown(function(event) {
    if (event.keyCode == 8 || event.keyCode == 46) { //backspace or delete
        if (unfinished_wire != null) {
            c.remove(unfinished_wire.shape)
            unfinished_wire = null
        } else if (get_active() != null) {
            for (var i = get_active().length - 1; i >= 0; i--) {
                var shape = get_active()[i]
                delete gates[find_by_shape(shape).id]
                c.remove(shape)
            }
        }
    } else if (event.keyCode == 67) { //c
        var active = c.getActiveObject()
        var active_object = undefined
        if (active)
            active_object = find_by_shape(active)

        if (unfinished_wire == null && active != null && find_wire(active_object, undefined) == null) {
            var coords = calc_output_pos(active_object)
            unfinished_wire = {
                begin: active_object,
                shape: new fabric.Line([ coords.x, coords.y, 0, 0 ], {
                    fill: 'blue',
                    stroke: 'blue',
                    strokeWidth: 5,
                    selectable: false
                })
            }
            c.add(unfinished_wire.shape)
        } else if (unfinished_wire != null && active && unfinished_wire.begin != active_object) {
            if (find_number_wires(active_object) < gate_types[active_object.type].args) {
                if (create_wire(unfinished_wire.begin, active_object)) {
                    c.remove(unfinished_wire.shape)
                    unfinished_wire = null
                }
            }
        }
    }

})

$('body').mousemove(function(event){
    if (unfinished_wire != null) {
        unfinished_wire.shape.set({ 'x2': event.pageX, 'y2': event.pageY })
    }
})

function create_gate(type, x, y) {
    var g = {
        id: uid++,
        type: type,
        shape: gate_types[type].make_shape(x, y)
    }
    gates[g.id] = g
    c.add(g.shape)
    return g
}

