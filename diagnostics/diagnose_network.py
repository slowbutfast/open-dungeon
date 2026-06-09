import socket
import sys

def check_connection(host_ip, port=1234):
    print(f"Diagnosing connection to LM Studio host at {host_ip}:{port}...")
    
    # 1. Basic socket test
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3.0) # 3 seconds timeout
    
    try:
        s.connect((host_ip, port))
        print("\n✅ Success! The port is open and reachable.")
        print(f"Your configured base URL is: http://{host_ip}:{port}/v1")
        s.close()
        return True
    except socket.timeout:
        print("\n❌ Connection Timeout.")
        print("The request took too long. This usually indicates:")
        print("  1. The host IP address is incorrect.")
        print("  2. A firewall on the host machine is blocking incoming traffic on port 1234.")
        print("  3. The host and client machines are not actually on the same subnet or AP isolation is active on your Wi-Fi.")
    except ConnectionRefusedError:
        print("\n❌ Connection Refused.")
        print("The host machine responded, but actively refused the connection. This means:")
        print("  - LM Studio is running, but it is bound ONLY to 'localhost' (127.0.0.1).")
        print("\nFix in LM Studio on the host machine:")
        print("  1. Open LM Studio -> Go to the Local Server tab (<-> icon).")
        print("  2. Locate the 'Port & Address' / 'Server Settings' panel.")
        print("  3. Change the 'Host' binding setting from '127.0.0.1' or 'localhost' to '0.0.0.0'.")
        print("  4. Restart the Local Server in LM Studio.")
    except Exception as e:
        print(f"\n❌ Unexpected connection error: {e}")
        
    s.close()
    return False

if __name__ == "__main__":
    import os
    # Add parent directory to sys.path so config.py can be imported from root folder
    parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if parent_dir not in sys.path:
        sys.path.append(parent_dir)
        
    from config import LM_STUDIO_HOST, LM_STUDIO_PORT
    port = int(LM_STUDIO_PORT)
    
    if len(sys.argv) > 1:
        ip = sys.argv[1]
    else:
        # If the user has configured something other than localhost in the .env file, use that.
        if LM_STUDIO_HOST not in ("127.0.0.1", "localhost"):
            print(f"Using host '{LM_STUDIO_HOST}' configured in your .env file.")
            ip = LM_STUDIO_HOST
        else:
            print("No IP address provided as argument and .env is set to default (127.0.0.1).")
            print("Please enter the local IP address of the host machine running LM Studio (e.g., 192.168.1.150):")
            ip = input("Host IP Address: ").strip()
        
    if not ip:
        print("No IP address entered. Exiting.")
        sys.exit(1)
        
    check_connection(ip, port)
