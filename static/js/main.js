var c = new fabric.Canvas('c')
c.setWidth(1000)
c.setHeight(500)

gates = {}
wires = []

var uid = 100

var socket = io.connect()

var AND_svg;
var OR_svg;
var NOT_svg;
var NAND_svg;
var XOR_svg;
var XNOR_svg;
var NOR_svg;
    fabric.loadSVGFromURL("images/AND.svg",function(objects, options) {
        AND_svg = fabric.util.groupSVGElements(objects, options);
    });
    fabric.loadSVGFromURL("images/OR_3.svg",function(objects, options) {
        OR_svg = fabric.util.groupSVGElements(objects, options);
    });
    fabric.loadSVGFromURL("images/NOT.svg",function(objects, options) {
        NOT_svg = fabric.util.groupSVGElements(objects, options);
    });
    fabric.loadSVGFromURL("images/NAND.svg",function(objects, options) {
        NAND_svg = fabric.util.groupSVGElements(objects, options);
    });
    fabric.loadSVGFromURL("images/XOR_2.svg",function(objects, options) {
        XOR_svg = fabric.util.groupSVGElements(objects, options);
    });
    fabric.loadSVGFromURL("images/XNOR_2.svg",function(objects, options) {
        XNOR_svg = fabric.util.groupSVGElements(objects, options);
    });
    fabric.loadSVGFromURL("images/NOR_2.svg",function(objects, options) {
        NOR_svg = fabric.util.groupSVGElements(objects, options);
    });


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

function create_wire(g1, g2, supress_packet) {
    if (g1 && g2 && g1 != g2) {
        w = {
            begin: g1,
            end: g2,
            input_num: find_number_wires(g2)
        }
        w.shape = create_wire_shape(w)
        wires.push(w)
        if (!supress_packet) {
            socket.emit('wire_connect', { 'id1': g1.id, 'id2': g2.id })
        }
        return w
    }
}

function create_gate(type, x, y, id) {
    var g = {
        id: id || uid++,
        type: type,
        shape: gate_types[type].make_shape(x, y)
    }
    g.shape.set({ 'onChange': function() { check_pos = true; console.log('onChange') } })
    gates[g.id] = g
    c.add(g.shape)
    if (!id) { //if an id was passed, it was created by a websocket, so we shouldnt recreate it
        socket.emit('create', { 'type': type, 'id': g.id, 'x': x, 'y': y })
    }
    return g
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

function save_pos() {
    var pos = {}
    for (var id in gates) {
        if (gates.hasOwnProperty(id)) {
            pos[id] = { 'x': gates[id].shape.left, 'y': gates[id].shape.top }
        }
    }
    return pos
}

function check_pos_move(old_pos) {
    for (var id in gates) {
        if (gates.hasOwnProperty(id) && old_pos.hasOwnProperty(id)) {
            if (gates[id].shape.left != old_pos[id]['x'] || gates[id].shape.top != old_pos[id]['y']) {
                console.log('emit move', gates[id])
                socket.emit('move', { 'id': id, 'x': gates[id].shape.left, 'y': gates[id].shape.top })
            }
        }
    }
    check_pos = false
} 

var pos = null
var last_pos_update = 0
function update() {
    if (pos && +new Date() - last_pos_update > 50) {
        check_pos_move(pos)
        last_pos_update = +new Date()
    }
    pos = save_pos()
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
                var object = find_by_shape(shape)
                console.log('destroy ', object.id)
                socket.emit('destroy', { 'id': object.id })
                delete gates[object.id]
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

socket.on('connect', function() {
    socket.emit('join', {})
})

socket.on('gate_status', function(data) {
    console.log('wire connect', data)
    for (var id in data) {
        if (data.hasOwnProperty(id)) {
            create_gate(data[id]['type'], data[id]['x'], data[id]['y'], id)
        }
    }
})

socket.on('wire_status', function(data) {
    for (var output in data) {
        if (data.hasOwnProperty(output)) {
            create_wire(gates[output], gates[data[output]], true)
        }
    }
})

socket.on('create', function(data) {
    create_gate(data['type'], data['x'], data['y'], data['id'])
})

socket.on('destroy', function(data) {
    console.log('destroy packet', data)
    if (gates.hasOwnProperty(data['id'])) {
        c.remove(gates[data['id']].shape)
        delete gates[data['id']]
    }
})

socket.on('wire_connect', function(data) {
    create_wire(gates[data['id1']], gates[data['id2']], true)
})

socket.on('move', function(data) {
    if (gates.hasOwnProperty(data['id'])) {
        gates[data['id']].shape.left = data['x']
        gates[data['id']].shape.top = data['y']
        pos = null
    }
})

function create_SVG(type, x, y){
    fabric.loadSVGFromURL("images/OR_3.svg",function(objects, options) {
        var svg = fabric.util.groupSVGElements(objects, options);
        svg.set({'left': x, 'top': y, 'padding':0})
        svg.setCoords();
        c.add(svg)
        c.renderAll()

    });
}
