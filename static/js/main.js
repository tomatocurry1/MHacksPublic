var c = new fabric.Canvas('c'),
    cEl = $(c.upperCanvasEl)
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
    gates.push(g)
    c.add(g.shape)
    return g
}

