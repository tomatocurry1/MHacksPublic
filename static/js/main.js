var c = new fabric.Canvas('c')
c.setWidth(1000)
c.setHeight(500)

var socket = io.connect()

var gates = {}
var wires = {}

var Gate = function() {}


svgs = {}
ops = [ 'and', 'or', 'not', 'nand', 'xor', 'xnor', 'nor' ]
for (var i = ops.length - 1; i >= 0; i--) {
    fabric.loadSVGFromURL("images/" + ops[i].toUpperCase() + ".svg", (function(index){ 
        return function(objects, options) {
            svgs[ops[index]] = fabric.util.groupSVGElements(objects, options)
        }
    })(i))
}

fabric.loadSVGFromURL("images/circle.svg", function(objects, options) {
    svgs['toggle'] = fabric.util.groupSVGElements(objects, options)
})
fabric.loadSVGFromURL("images/stopwatch.svg", function(objects, options) {
    svgs['stopwatch'] = fabric.util.groupSVGElements(objects, options)
})

function get_svg_for_type(type, x, y) {
    var g = fabric.util.object.clone(svgs[type])
    g.set({
        x: x,
        y: y,
        width: 50,
        height: 50,
        hasControls: false
    })
    return g
}

Gate.prototype.update_with = function(serialized) {
    this.id = serialized['id']
    this.type = serialized['type']
    this.num_args = serialized['num_args']
    this.x = serialized['x']
    this.y = serialized['y']
    this.shape = get_svg_for_type(this.type, this.x, this.y)
    this.shape.left = serialized['x']
    this.shape.top = serialized['y']
    this.shape.gate_id = this.id
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
    var spaces = g.num_args + 1
    var space_height = g.shape.height / spaces
    return {
        x: g.x - g.shape.width / 2,
        y: g.y - g.shape.height / 2 + space_height * input_num
    }
}

function calc_output_pos(g) {
    return {
        x: g.x + g.shape.width / 2,
        y: g.y //+ g.shape.height / 2
    }
}

Wire.prototype.setup_shape = function() {
    var n = find_number_wires(this.to_gate)
    if (!this.hasOwnProperty('input_num') || this.input_num > n)
        this.input_num = n

    var op = calc_output_pos(this.from_gate)
    var ip = calc_input_pos(this.to_gate, this.input_num)
    //this.to_gate.shape.fill = 'blue'
    this.shape.set({
        'x1': op.x,
        'y1': op.y,
        'x2': ip.x,
        'y2': ip.y
    })
}

Wire.prototype.update_with = function(from_gate_id, to_gate_id) {
    this.from_gate = gates[from_gate_id]
    this.to_gate = gates[to_gate_id]

    this.setup_shape()
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
            wires[start] = new Wire()
            wires[start].update_with(start, data['wires'][start])
            c.add(wires[start].shape)
        }
    }
})

socket.on('gate_updated', function(data) {
    if (!gates.hasOwnProperty(data['id'])) {
        gates[data['id']] = new Gate()
        gates[data['id']].update_with(data)
        c.add(gates[data['id']].shape)
    } else {
        gates[data['id']].update_with(data)
    }
})

socket.on('gate_destroyed', function(data) {
    console.log('destroying gate cs', data['id'], gates[data['id']].shape)
    //c.remove(gates[data['id']].shape) //would normally delete the shape here but we have to delete it earlier because reasons
    delete gates[data['id']]
})

socket.on('wire_updated', function(data) {
    if (!wires.hasOwnProperty(data['from_gate_id'])) {
        wires[data['from_gate_id']] = new Wire()
        wires[data['from_gate_id']].update_with(data['from_gate_id'], data['to_gate_id'])
        c.add(wires[data['from_gate_id']].shape)
    } else {
        wires[data['from_gate_id']].update_with(data['from_gate_id'], data['to_gate_id'])
    }
})

socket.on('wire_destroyed', function(data) {
    c.remove(wires[data['from_gate_id']].shape)
    delete wires[data['from_gate_id']]
})

function find_by_shape(shape) {
    return gates[shape.gate_id]
}

function update_wires() {
    for (var start in wires) {
        if (wires.hasOwnProperty(start)) {
            var new_input_num = find_number_wires(wires[start].to_gate)
            if (new_input_num < wires[start].input_num){
                wires[start].input_num = new_input_num
                wires[start].setup_shape()
            }
        }
    }
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

function moved(position, gate) {
    gate.x = position['x']
    gate.y = position['y']
    socket.emit('move', { 'id': gate.id, 'x': gate.x, 'y': gate.y })
}

c.on('object:moving', function(e) {
    //console.log(e)
    if (e.target.hasOwnProperty('gate_id')) {
        moved({ 'x': e.target.left, 'y': e.target.top }, gates[e.target.gate_id])
    } else if (e.target.hasOwnProperty('_objects')) {
        console.log(e.target)
        for (var i = e.target._objects.length - 1; i >= 0; i--) {
            if (e.target._objects[i].hasOwnProperty('gate_id')) {
                moved({
                    'x': e.target._objects[i].left /*+ e.target.width / 2*/ + e.target.left,
                    'y': e.target._objects[i].top /*+ e.target.height / 2*/ + e.target.top
                }, gates[e.target._objects[i].gate_id])
            }
        }
    }
})

c.on('mouse:down', function(e) {
    if (e.target.hasOwnProperty('gate_id')) {
        socket.emit('click', { 'id': e.target.gate_id })
    }
})

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
    for (var start in wires) {
        if (wires.hasOwnProperty(start)){
            if (wires[start].to_gate == end)
                t++
        }
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
                console.log(find_by_shape(get_active()[i]).id)
                socket.emit('destroy_gate', { 'id': find_by_shape(get_active()[i]).id })
                c.remove(get_active()[i]) //ugly ass hack because it can't be deleted later because reasons
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
            console.log(find_number_wires(active_object))
            if (find_number_wires(active_object) < active_object.num_args) {
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
