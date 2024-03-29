import flask
import sys
import threading
import time
import traceback
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
            'x': self.x, 'y': self.y, 'state': self.on
        }

class AndGate(Gate):
    def __init__(self, id_, x, y):
        super(AndGate, self).__init__(id_, x, y)

    def run(self, inputs):
        return all(inputs)

AndGate.type = 'and'
AndGate.num_args = 2

class OrGate(Gate):
    def __init__(self, id_, x, y):
        super(OrGate, self).__init__(id_, x, y)

    def run(self, inputs):
        return any(inputs)

OrGate.type = 'or'
OrGate.num_args = 2

class NotGate(Gate):
    def __init__(self, id_, x, y):
        super(NotGate, self).__init__(id_, x, y)

    def run(self, inputs):
        return not inputs[0]
        
NotGate.type = 'not'
NotGate.num_args = 1

class NandGate(Gate):
    def __init__(self, id_, x, y):
        super(NandGate, self).__init__(id_, x, y)

    def run(self, inputs):
        return not all(inputs)
        
NandGate.type = 'nand'
NandGate.num_args = 2

class XorGate(Gate):
    def __init__(self, id_, x, y):
        super(XorGate, self).__init__(id_, x, y)

    def run(self, inputs):
        return inputs[0] != inputs[1]
        
XorGate.type = 'xor'
XorGate.num_args = 2

class XNorGate(Gate):
    def __init__(self, id_, x, y):
        super(XNorGate, self).__init__(id_, x, y)

    def run(self, inputs):
        return inputs[0] == inputs[1]
        
XNorGate.type = 'xnor'
XNorGate.num_args = 2

class NorGate(Gate):
    def __init__(self, id_, x, y):
        super(NorGate, self).__init__(id_, x, y)

    def run(self, inputs):
        return not any(inputs)
        
NorGate.type = 'nor'
NorGate.num_args = 2

class ToggleButton(Gate):
    def __init__(self, id_, x, y):
        super(ToggleButton, self).__init__(id_, x, y)

    def run(self, _):
        return self.on

    def on_click(self):
        print 'click', not self.on
        self.on = not self.on

ToggleButton.type = 'toggle'
ToggleButton.num_args = 0

class Stopwatch(Gate):
    def __init__(self, id_, x, y):
        super(Stopwatch, self).__init__(id_, x, y)
        self.start_time = time.time()

    def run(self, _):
        if time.time() - self.start_time > 1: #1 second
            self.start_time = time.time()
            return True
        else:
            return False

Stopwatch.type = 'stopwatch'
Stopwatch.num_args = 0

classes = [
    AndGate,
    OrGate,
    NotGate,
    NandGate,
    XorGate,
    XNorGate,
    NorGate,
    ToggleButton,
    Stopwatch
]
gate_types = dict(zip(map(lambda c: c.type, classes), classes))

GATE_LIMIT = 1000
class Simulation(object):
    def __init__(self):
        self.gates = {}
        self.wires = []
        self.uid = 0

    def create_wire(self, from_gate_id, to_gate_id):
        self.wires.append((from_gate_id, to_gate_id))
        self.ws.send_wire_update(from_gate_id, to_gate_id)

    def create_gate(self, type_, x, y, **kwargs):
        if len(self.gates) >= GATE_LIMIT:
            raise Exception('Too many gates, delete some')
        self.gates[self.uid] = gate_types[type_](self.uid, x, y, **kwargs)
        self.ws.send_gate_update(self.gates[self.uid].serialize())
        self.uid += 1
        return self.gates[self.uid - 1]

    def destroy_gate(self, id_):
        if id_ in self.gates:
            for s, e in self.wires:
                if s == id_ or e == id_:
                    self.wires.remove((s, e))
                    self.ws.send_wire_destroy(s, e)
            del self.gates[id_]
            self.ws.send_gate_destroy(id_)
        else:
            print 'Got id {0}, which is not in {1}'.format(id_, self.gates.keys())

    def move_gate(self, id_, new_x, new_y):
        #print 'move', new_x, new_y
        if id_ not in self.gates.keys():
            raise Exception('No such gate {0} in {1} {2}'.format(id_, self.gates, id_ in self.gates.keys()))
        self.gates[id_].x = new_x
        self.gates[id_].y = new_y
        self.ws.send_gate_update(self.gates[id_].serialize())
        for s, e in self.wires:
            if s == id_ or e == id_:
                self.ws.send_wire_update(s, e)

    def serialize(self):
        return {
            'gates': { id_ : gate.serialize() for id_, gate in self.gates.items() },
            'wires': [ { 'from': a, 'to': b } for a, b in self.wires ]
        }

sim = Simulation()

class WebsocketNamespace(BaseNamespace, BroadcastMixin):
    def initalize(self):
        print 'initalize'

    def on_join(self, data):
        sim.ws = self
        print sim.serialize()
        self.emit('initial', sim.serialize())

    def on_create_gate(self, data):
        try:
            type_, x, y = data['type'], int(data['x']), int(data['y'])
            sim.create_gate(type_, x, y)
        except Exception as e:
            tb = traceback.format_exc()
            print tb
            self.emit('error', { 'message': e.message, 'tb': tb })

    def on_destroy_gate(self, data):
        id_ = int(data['id'])
        print 'destroy gate', id_
        sim.destroy_gate(id_)

    def on_wire_connect(self, data):
        from_gate_id, to_gate_id = int(data['from_gate_id']), int(data['to_gate_id'])
        sim.create_wire(from_gate_id, to_gate_id)

    def on_move(self, data):
        try:
            id_, new_x, new_y = int(data['id']), int(data['x']), int(data['y'])
            sim.move_gate(id_, new_x, new_y)
        except Exception as e:
            self.emit('error', { 'message': e.message })

    def on_click(self, data):
        id_ = int(data['id'])
        if id_ in sim.gates and hasattr(sim.gates[id_], 'on_click'):
            sim.gates[id_].on_click()

    def on_ping(self, data):
        self.emit('sim_ping', { g.id : g.on for g in sim.gates.values() })

    def send_wire_update(self, from_gate_id, to_gate_id):
        self.broadcast_event('wire_updated', { 'from_gate_id': from_gate_id, 'to_gate_id': to_gate_id })

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

TICK_TIME_SECONDS = .5
def background_simulate():
    while True:
        try:
            start = time.time()
            for g in sim.gates.values():
                #print 'processing', g.id,
                inputs = filter(bool, map(lambda t: sim.gates[t[0]] if t[0] in sim.gates else None, filter(lambda t: t[1] == g.id, sim.wires)))
                if len(inputs) == g.num_args:
                    g.on = g.run(map(lambda i: i.on, inputs))
                #print len(inputs), len(inputs) == g.num_args, g.on

            sleeptime = TICK_TIME_SECONDS - time.time() + start
            if sleeptime > 0:
                time.sleep(sleeptime)
        except Exception as e:
            traceback.print_exc()

if __name__ == '__main__':
    t = threading.Thread(target=background_simulate, args=())
    t.daemon = True
    t.start()
    run_dev_server()