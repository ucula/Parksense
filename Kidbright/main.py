import _thread
import ubinascii
import machine
from machine import Pin, I2C, ADC, PWM, time_pulse_us
import network
import time
import ujson
from umqtt.robust import MQTTClient
from config import (
    WIFI_SSID, WIFI_PASS,
    MQTT_BROKER, MQTT_USER, MQTT_PASS, MQTT_TOPIC
)

# ── Pin Setup ─────────────────────────────────────────────────
led_green = Pin(12, Pin.OUT)
led_red   = Pin(2,  Pin.OUT, value=1)

# ── PIR PIN ─────────────────────────────────────────────────
PIR_PIN = 32   # I1
PIR = Pin(PIR_PIN, Pin.IN)

#── LIDAR Setup ─────────────────────────────────────────────────
LIDAR_PIN = 33 # I2
LIDAR = ADC(Pin(33))
LIDAR.atten(ADC.ATTN_11DB) 
LIDAR.width(ADC.WIDTH_12BIT)

#──Ultrasonic Setup────────────────────────────────────────────────
trig = Pin(19, Pin.OUT)
echo = Pin(23, Pin.IN)

# Temp
i2c = I2C(1, sda=Pin(4), scl=Pin(5))

# LEDs OFF at start
led_green.value(1)
led_red.value(1)

# ── WiFi ──────────────────────────────────────────────────────
def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        print("Connecting to WiFi...")
        wlan.connect(WIFI_SSID, WIFI_PASS)
        timeout = time.ticks_ms()
        while not wlan.isconnected():
            if time.ticks_diff(time.ticks_ms(), timeout) > 15000:
                print("WiFi FAILED")
                return None
            time.sleep(0.5)
    print("WiFi connected:", wlan.ifconfig())
    return wlan

def connect_mqtt():
    client_id = ubinascii.hexlify(machine.unique_id()).decode('utf-8')
    client = MQTTClient(
        client_id="KB_" + client_id,
        server=MQTT_BROKER,
        user=MQTT_USER,
        password=MQTT_PASS
    )
    client.connect()
    print("MQTT connected as:", "KB_" + client_id)
    return client

# -------LED---------
def blink_ok():
    led_green.value(0)
    time.sleep_ms(300)
    led_green.value(1)

def blink_error():
    led_red.value(0)
    time.sleep_ms(300)
    led_red.value(1)

def heartbeat(curr_time, last_time, led_state):
    if led_state[0] == 0:  # ON → turn off after 100ms
        if time.ticks_diff(curr_time, last_time[0]) >= 100:
            led_red.value(1)
            led_state[0] = 1
            last_time[0] = curr_time
    else:                   # OFF → turn on after 1400ms
        if time.ticks_diff(curr_time, last_time[0]) >= 1400:
            led_red.value(0)
            led_state[0] = 0
            last_time[0] = curr_time
            
# ── Ultrasonic──────────────────────────────────────────────────────
def ultrasonic():
    trig.off()
    time.sleep_us(5)
    trig.on()
    time.sleep_us(10)
    trig.off()
    return time_pulse_us(echo, 1, 30000)

# ── Read Temperature (LM73-1 via I2C) ────────────────────────
def read_temperature():
    try:
        i2c.writeto(77, bytearray([0]))
        data = i2c.readfrom(77, 2)
        value = (data[0] << 8) | data[1]
        if value & 0x8000:
            value -= 65536
        return round(value / 128.0, 1)
    except:
        print("Temp read error")
        return 0.0

# ── Main ──────────────────────────────────────────────────────
wlan = connect_wifi()
if wlan is None:
    while True:
        led_red.value(0)
        time.sleep_ms(200)
        led_red.value(1)
        time.sleep_ms(200)

mqtt = connect_mqtt()
last_heart_time = [time.ticks_ms()]
heart_state     = [1]

old_pir = None
while True:
    curr_time = time.ticks_ms()

    Ultra_value = ultrasonic()
    PIR_value = PIR.value()
    LIDAR_value = LIDAR.read() # Analog from LIDAR to processed later in RED
    temp  = read_temperature()
    # Heartbeat LED
    heartbeat(curr_time, last_heart_time, heart_state)
    
    if PIR_value == 1 and old_pir == 0:  
        data = {
            "pir" : PIR_value,
            "ultrasonic_us": Ultra_value,
            "sharp_analog": LIDAR_value,
            "board_temp": temp
        }

        payload = ujson.dumps(data)
        print("Publishing:", payload)

        try:
            if not wlan.isconnected():
                print("WiFi lost — reconnecting...")
                blink_error()
                wlan = connect_wifi()

            try:
                mqtt.ping()
            except:
                print("MQTT lost — reconnecting...")
                blink_error()
                mqtt = connect_mqtt()

            mqtt.publish(MQTT_TOPIC, payload)
            print("Published OK")
            blink_ok()

        except Exception as e:
            print("Publish failed:", e)
            blink_error()
    old_pir = PIR.value()
    time.sleep_ms(30)