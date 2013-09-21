var c = new fabric.Canvas('c')
c.setWidth(1000)
c.setHeight(500)

var socket = io.connect()

var gates = {}
var wires = {}

var Gate = function() {}

gate_type_to_graphic = {
    'and': function(x, y) {
        return new fabric.Triangle({
            left: x,
            top: y,
            fill: 'red',
            width: 50,
            height: 50,
            angle: 90,
            hasControls: false
        })
    }
}

Gate.prototype.update_with = function(serialized) {
    this.id = serialized['id']
    this.type = serialized['type']
    this.num_args = serialized['num_args']
    this.x = serialized['x']
    this.y = serialized['y']
    this.shape = gate_type_to_graphic[this.type](this.x, this.y)
    this.shape.left = serialized['x']
    this.shape.top = serialized['y']
    this.on = serialized['state']
}

var Wire = function() {
    this.shape = new fabric.Line( [0, 0, 0, 0], {
        fill: 'black',
        stroke: 'black',
        strokeWidth: 5,
        selectable: false
    })
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

Wire.prototype.update_with = function(from_gate_id, to_gate_id) {
    this.from_gate = gates[from_gate_id]
    this.to_gate = gates[to_gate_id]
    this.shape.set({
        'x1': this.from_gate.x + this.from_gate.shape.width / 2,
        'y1': calc_output_pos(this.from_gate),
        'x2': this.to_gate.x - this.to_gate.shape.width / 2,
        'y2': calc_input_pos(this.to_gate, 1)
    })
}

socket.on('connect', function() {
    socket.emit('join', {})
})

socket.on('error', function(data) {
    console.log('error:', data['message'])
})

socket.on('initial', function(data) {
    for (var id in data['gates']) {
        if (data['gates'].hasOwnProperty(id)) {
            var g = new Gate()
            g.update_with(data['gates'][id])
            gates[id] = g
            c.add(gates[id].shape)
        }
    }
    for (var start in data['wires']) {
        if (data['wires'].hasOwnProperty(start)) {
            wires[start] = data['wires'][start]
        }
    }
})

socket.on('gate_updated', function(data) {
    if (!gates.hasOwnProperty(data['id'])) {
        gates[data['id']] = new Gate()
        gates[data['id']].update_with(data)
        console.log(gates[data['id']], gates[data['id']].update_with, gates[data['id']].shape)
        c.add(gates[data['id']].shape)
    } else {
        gates[data['id']].update_with(data)
    }
})

socket.on('gate_destroyed', function(data) {
    c.remove(gates[data['id']].shape)
    delete gates[data['id']]
})

socket.on('wire_updated', function(data) {
    if (!wires.hasOwnProperty(data['from_gate_id'])) {
        gates[data['from_gate_id']] = new Wire()
        gates[data['from_gate_id']].update_with(data['from_gate_id'], data['to_gate_id'])
        c.add(gates[data['from_gate_id']].shape)
    }
    gates[data['from_gate_id']].update_with(data['from_gate_id'], data['to_gate_id'])
})

socket.on('wire_destroyed', function(data) {
    c.remove(wires[data['from_gate_id']])
    delete wires[data['from_gate_id']]
})

function find_by_shape(shape) {
    for (var id in gates) {
        if (gates.hasOwnProperty(id) && gates[id].shape == shape) {
            return gates[id]
        }
    }
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
                socket.emit('destroy_gate', { 'id': find_by_shape(get_active()[i]).id })
            }
        }
    } else if (event.keyCode == 67) { //c
        var active = c.getActiveObject()
        var active_object = active ? find_by_shape(active) : undefined

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
                socket.emit('wire_connect', {
                    'from_gate_id': unfinished_wire.begin.id,
                    'to_gate_id': active_object.id
                })
                c.remove(unfinished_wire.shape)
                unfinished_wire = null
            }
        }
    }

})

$('body').mousemove(function(event){
    if (unfinished_wire != null) {
        unfinished_wire.shape.set({ 'x2': event.pageX, 'y2': event.pageY })
    }
})

