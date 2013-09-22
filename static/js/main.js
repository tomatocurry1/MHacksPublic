var c = new fabric.Canvas('c')
c.setWidth(1000)
c.setHeight(500)

// Array Remove - By John Resig (MIT Licensed)
Array.prototype.remove = function(from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

var socket = io.connect()

var gates = {}
var wires = []

var Gate = function() {}

function color_svg(shape, color) {
    if (shape.isSameColor && shape.isSameColor() || !shape.paths) {
        shape.setFill(color);
    } else if (shape.paths) {
        for (var i = 0; i < shape.paths.length; i++) {
            shape.paths[i].setFill(color);
        }
    }
}

svgs_normal = {}
svgs_powered = {}
ops = [ 'and', 'or', 'not', 'nand', 'xor', 'xnor', 'nor' ]
for (var i = ops.length - 1; i >= 0; i--) {
    fabric.loadSVGFromURL("images/" + ops[i].toUpperCase() + ".svg", (function(index){ 
        return function(objects, options) {
            svgs_normal[ops[index]] = fabric.util.groupSVGElements(objects, options)
        }
    })(i))
    fabric.loadSVGFromURL("images/" + ops[i].toUpperCase() + ".svg", (function(index){ 
        return function(objects, options) {
            svgs_powered[ops[index]] = fabric.util.groupSVGElements(objects, options)
            color_svg(svgs_powered[ops[index]], 'red')
        }
    })(i))
}

fabric.loadSVGFromURL("images/circle.svg", function(objects, options) {
    var svg = fabric.util.groupSVGElements(objects, options)
    svgs_normal['toggle'] = fabric.util.object.clone(svg)
    svgs_powered['toggle'] = fabric.util.object.clone(svg)
    color_svg(svgs_powered['toggle'], 'red')
})
fabric.loadSVGFromURL("images/stopwatch.svg", function(objects, options) {
    var svg = fabric.util.groupSVGElements(objects, options)
    svgs_normal['stopwatch'] = fabric.util.object.clone(svg)
    svgs_powered['stopwatch'] = fabric.util.object.clone(svg)
    color_svg(svgs_powered['stopwatch'], 'red')
})

function get_svg_for_type(type, x, y, powered) {
    var g = fabric.util.object.clone(powered ? svgs_powered[type] : svgs_normal[type])
    g.set({
        x: x,
        y: y,
        width: 50,
        height: 50,
        hasControls: false
    })
    return g
}

Gate.prototype.rebuild_sprite = function() {
    for (var i = c._objects.length - 1; i >= 0; i--) {
        if (c._objects[i].hasOwnProperty('gate_id') && c._objects[i].gate_id == this.id) {
            c.remove(c._objects[i])
        }
    }
    //console.log('rebuilding sprite 4 ' + this.id + ' on = ' + this.on)
    this.shape = get_svg_for_type(this.type, this.x, this.y, this.on)
    this.shape.left = this.x
    this.shape.top = this.y
    this.shape.gate_id = this.id
    c.add(this.shape)
}

Gate.prototype.update_with = function(serialized) {
    this.id = serialized['id']
    this.type = serialized['type']
    this.num_args = serialized['num_args']
    this.x = serialized['x']
    this.y = serialized['y']
    this.on = serialized['state']
    this.rebuild_sprite()
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
    console.log(data['tb'])
})

var inited = false
socket.on('initial', function(data) {
    inited = true
    for (var id in data['gates']) {
        if (data['gates'].hasOwnProperty(id)) {
            var g = new Gate()
            g.update_with(data['gates'][id])
            gates[id] = g
            c.add(gates[id].shape)
        }
    }

    for (var i = data['wires'].length - 1; i >= 0; i--) {
        var w = new Wire()
        wires.push(w)
        w.update_with(data['wires'][i]['from'], data['wires'][i]['to'])
        c.add(w.shape)
    };
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
    c.remove(gates[data['id']].shape) //would normally delete the shape here but we have to delete it earlier because reasons
    delete gates[data['id']]
})

function find_wire(starting_id, ending_id) {
    for (var i = 0; i < wires.length; i++) {
        if (starting_id == wires[i].from_gate.id && ending_id == wires[i].to_gate.id)
            return wires[i]
    }
}

socket.on('wire_updated', function(data) {
    if (!find_wire(data['from_gate_id'], data['to_gate_id'])) {
        var w = new Wire()
        wires.push(w)
        w.update_with(data['from_gate_id'], data['to_gate_id'])
        c.add(w.shape)
    } else {
        find_wire(data['from_gate_id'], data['to_gate_id']).update_with(data['from_gate_id'], data['to_gate_id'])
    }
})

socket.on('wire_destroyed', function(data) {
    var w = find_wire(data['from_gate_id'], data['to_gate_id'])
    c.remove(w.shape)
    wires.remove(w)
})

function find_by_shape(shape) {
    return gates[shape.gate_id]
}

function update_wires() {
    for (var i = 0; i < wires.length; i++) {
        var new_input_num = find_number_wires(wires[i].to_gate)
        if (new_input_num < wires[i].input_num){
            wires[i].input_num = new_input_num
            wires[i].setup_shape()
        }
    };
}

var last_ping = 0
function update() {
    if (c.getActiveGroup() != null) {
        c.getActiveGroup().hasControls = false
    }
    update_wires()
    if (inited && +new Date() - last_ping > 500) {
        last_ping = +new Date()
        socket.emit('ping', {})
    }
    c.renderAll()
    fabric.util.requestAnimFrame(update, c.upperCanvasEl)
}
fabric.util.requestAnimFrame(update, c.upperCanvasEl)

socket.on('sim_ping', function(data) {
    //console.log(data)
    for (var id in data) {
        if (data.hasOwnProperty(id)) {
            if (gates[id]){
                gates[id].on = data[id]
                gates[id].rebuild_sprite()
            } else {
                console.log("Got bad gate id " + id)
            }
        }
    }
    c.renderAll()
})

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
    if (e.target && e.target.hasOwnProperty('gate_id')) {
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
                socket.emit('destroy_gate', { 'id': find_by_shape(get_active()[i]).id })
            }
        }
    } else if (event.keyCode == 67) { //c
        var active = c.getActiveObject()
        var active_object = active ? find_by_shape(active) : undefined

        if (unfinished_wire == null && active != null) {
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
