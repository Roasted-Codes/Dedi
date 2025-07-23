#!/bin/env python3
from qmp import QEMUMonitorProtocol
import sys
import os, os.path
import json
import subprocess
import time
import socket
import struct
import datetime

#The test class is JayFoxRox's code.
class Test(object):

  def stop(self):
    if self._p:
      self._p.terminate()
      self._p = None

  def run_cmd(self, cmd):
    if type(cmd) is str:
      cmd = {
          "execute": cmd, 
          "arguments": {}
      }
    resp = self._qmp.cmd_obj(cmd)
    if resp is None:
      raise Exception('Disconnected!')
    return resp

  def run_cmd2(self, cmd, arg):
    if type(cmd) is str:
      cmd = {
          "execute": cmd, 
          "arguments": {"keys":[ {"type": "qcode", "data": arg}],
                        "hold-time": 250}
          
      }
      print(cmd)
    resp = self._qmp.cmd_obj(cmd)
    if resp is None:
      raise Exception('Disconnected!')
    return resp

  def pause(self):
    return self.run_cmd('stop')

  def cont(self):
    return self.run_cmd('cont')

  def restart(self):
    return self.run_cmd('system_reset')

  def screenshot(self):
    cmd = {
        "execute": "screendump", 
        "arguments": {
            "filename": "screenshot.ppm"
        }
    }
    return self.run_cmd(cmd)

  def isPaused(self):
    resp = self.run_cmd('query-status')
    return resp['return']['status'] == 'paused'

  def read(self, addr, size):
    cmd = {
        "execute": "human-monitor-command", 
        "arguments": { "command-line": "x /%dxb %d" % (size,addr) }
    }
    response = self.run_cmd(cmd)
    lines = response['return'].replace('\r', '').split('\n')
    data_string = ' '.join(l.partition(': ')[2] for l in lines).strip()
    data = bytes(int(b, 16) for b in data_string.split(' '))
    return data


t = Test()
i = 0

#The connection loop is JayFoxRox's code.
while True:
  print('Trying to connect %d' % i)
  if i > 0: time.sleep(1)
  try:
    t._qmp = QEMUMonitorProtocol(('localhost', 4444))
    t._qmp.connect()
  except Exception as e:
    if i > 4:
      raise
    else:
      i += 1
      continue
  break

import time
print("wait 15 seconds")
time.sleep(15)
#wait some time
t.run_cmd2("send-key", "return")
print("wait 2 seconds")
time.sleep(2)
t.run_cmd2("send-key", "a")
print("wait 2 seconds")
time.sleep(2)
t.run_cmd2("send-key", "a")
print("wait 2 seconds")
time.sleep(2)
t.run_cmd2("send-key", "a")
print("wait 2 seconds")
time.sleep(2)
t.run_cmd2("send-key", "a")
print("wait 2 seconds")
time.sleep(2)