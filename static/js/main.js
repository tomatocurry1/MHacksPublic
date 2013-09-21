var c = new fabric.Canvas('c')
c.setWidth(1000)
c.setHeight(500)

gates = []

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

function update() {
    if (gates.length) {
        for (var i = gates.length - 1; i >= 0; i--) {
            if (gates[i].dragged) {
                
            }
        }
    }
    c.renderAll()
    fabric.util.requestAnimFrame(update, c.upperCanvasEl)
}
fabric.util.requestAnimFrame(update, c.upperCanvasEl)

function set_dragged(g) {
    for (var i = gates.length - 1; i >= 0; i--) {
        gates[i].dragged = false
    }
    g.dragged = true
}

function create_gate(type, x, y, dragged) {
    var g = {
        id: uid++,
        type: type,
        shape: gate_types[type].make_shape(x, y),
        dragged: dragged || false
    }
    gates.push(g)
    c.add(g.shape)
    return g
}

