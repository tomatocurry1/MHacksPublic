import flask
import sys
import werkzeug.serving
import werkzeug.debug
from socketio import socketio_manage
from socketio.namespace import BaseNamespace
from socketio.mixins import BroadcastMixin
from socketio.server import SocketIOServer
from gevent import monkey; monkey.patch_all()

app = flask.Flask(__name__, static_folder='static', static_url_path='')

class Gate(object):
    def __init__(self, id_, x, y):
        self.id = id_
        self.x = x
        self.y = y
        self.on = False

    def serialize(self):
        return {
            'type': self.type,
            'num_args': self.num_args,
            'id': self.id,
            'x': self.x, 'y': self.y, 'state': self.on }

class AndGate(Gate):
    def __init__(self, id_, x, y):
        super(AndGate, self).__init__(id_, x, y)

    def run(self, inputs):
        return all(inputs)

AndGate.type = 'and'
AndGate.num_args = 2

gate_types = { AndGate.type : AndGate }

GATE_LIMIT = 1000
class Simulation(object):
    def __init__(self, ws):
        self.ws = ws
        self.gates = {}
        self.wires = {}
        self.uid = 0

    def create_wire(self, from_gate_id, to_gate_id):
        self.wires[from_gate_id] = to_gate_id
        self.ws.send_wire_update(from_gate_id, to_gate_id)

    def create_gate(self, type_, x, y):
        if len(self.gates) >= GATE_LIMIT:
            raise Exception('Too many gates, delete some')
        self.uid += 1
        self.gates[self.uid] = gate_types[type_](self.uid, x, y)
        self.ws.send_gate_update(self.gates[self.uid].serialize())

    def destroy_gate(self, id_):
        for s, e in self.wires.items():
            if s == id_ or e == id_:
                ws.send_wire_destroy(s, e)
        ws.send_gate_destroy(id_)

    def move_gate(self, id_, new_x, new_y):
        if id_ not in self.gates:
            raise Exception('No such gate {0} {1}'.format(id_, self.gates))
        self.gates[id_].x = new_x
        self.gates[id_].y = new_y
        self.ws.send_gate_update(self.gates[id_].serialize())
        for s, e in self.wires.items():
            if s == id_ or e == id_:
                ws.send_wire_update(s, e)

    def serialize(self):
        return {
            'gates': { id_ : gate.serialize() for id_, gate in self.gates.items() },
            'wires': self.wires
        }


class WebsocketNamespace(BaseNamespace, BroadcastMixin):
    def __init__(self, *args, **kwargs):
        super(WebsocketNamespace, self).__init__(*args, **kwargs)
        self.sim = Simulation(self)

    def initalize(self):
        print 'initalize'

    def on_join(self, data):
        self.emit('initial', self.sim.serialize())

    def on_create_gate(self, data):
        try:
            type_, x, y = data['type'], data['x'], data['y']
            self.sim.create_gate(type_, x, y)
        except Exception as e:
            print e, e.message
            self.emit('error', { 'message': e.message })

    def on_destroy_gate(self, data):
        id_ = data['id']
        self.sim.destroy_gate(id_)

    def on_wire_connect(self, data):
        from_gate_id, to_gate_id = data['from_gate_id'], data['to_gate_id']
        self.sim.create_wire(from_gate_id, to_gate_id)

    def on_move(self, data):
        try:
            id_, new_x, new_y = data['id'], data['x'], data['y']
            self.sim.move_gate(id_, new_x, new_y)
        except Exception as e:
            self.emit('error', { 'message': e.message })

    def send_wire_update(self, from_gate_id, to_gate_id):
        self.broadcast_event('wire_created', { 'from_gate_id': from_gate_id, 'to_gate_id': to_gate_id })

    def send_wire_destroy(self, start, end):
        self.broadcast_event('wire_destroyed', { 'from_gate_id': start, 'to_gate_id': end })

    def send_gate_update(self, serialized_gate):
        self.broadcast_event('gate_updated', serialized_gate)

    def send_gate_destroy(self, id_):
        self.broadcast_event('gate_destroyed', { 'id': id_ })



class DebuggedApplicationFix(werkzeug.debug.DebuggedApplication): #the debugger doesn't work with ws: http://stackoverflow.com/a/18552263/1159735
    def __call__(self, environ, start_response):
        # check if websocket call
        if "wsgi.websocket" in environ and not environ["wsgi.websocket"] is None:
            # a websocket call, no debugger ;)
            return app(environ, start_response)
        # else go on with debugger
        return werkzeug.debug.DebuggedApplication.__call__(self, environ, start_response)

@app.route('/socket.io/<path:rest>', methods=['GET', 'POST'])
def push_stream(rest):
    try:
        socketio_manage(flask.request.environ, {'': WebsocketNamespace}, flask.request)
    except Exception as e:
        app.logger.error("Exception while handling socketio connection", exc_info=True)
    return flask.Response()

#@werkzeug.serving.run_with_reloader
def run_dev_server():
    global server
    app.debug = True
    port = 5000
    dapp = DebuggedApplicationFix(app, evalex = True)
    server = SocketIOServer(('' if len(sys.argv) == 1 else sys.argv[1], port), dapp, resource="socket.io")
    server.serve_forever()

if __name__ == '__main__':
    run_dev_server()