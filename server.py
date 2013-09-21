import flask
import werkzeug.serving
import werkzeug.debug
from socketio import socketio_manage
from socketio.namespace import BaseNamespace
from socketio.mixins import BroadcastMixin
from socketio.server import SocketIOServer
from gevent import monkey; monkey.patch_all()

app = flask.Flask(__name__, static_folder='static', static_url_path='')

class DebuggedApplicationFix(werkzeug.debug.DebuggedApplication): #the debugger doesn't work with ws: http://stackoverflow.com/a/18552263/1159735
    def __call__(self, environ, start_response):
        # check if websocket call
        if "wsgi.websocket" in environ and not environ["wsgi.websocket"] is None:
            # a websocket call, no debugger ;)
            return app(environ, start_response)
        # else go on with debugger
        return werkzeug.debug.DebuggedApplication.__call__(self, environ, start_response)

#@werkzeug.serving.run_with_reloader
def run_dev_server():
    global server
    app.debug = True
    port = 5000
    dapp = DebuggedApplicationFix(app, evalex = True)
    server = SocketIOServer(('', port), dapp, resource="socket.io")
    server.serve_forever()

if __name__ == '__main__':
    run_dev_server()