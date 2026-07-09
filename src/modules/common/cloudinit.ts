export function generateCloudInitScript(password: string): string {
  return `#cloud-config

disable_root: false
ssh_pwauth: true

chpasswd:
  expire: false
  users:
    - name: root
      password: ${password}
      type: text

runcmd:
  - sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
  - sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
  - systemctl restart ssh || systemctl restart sshd
`;
}

export function encodeCloudInitToBase64(script: string): string {
  return Buffer.from(script).toString("base64");
}

export function generateCloudInitBase64(password: string): string {
  const script = generateCloudInitScript(password);
  return encodeCloudInitToBase64(script);
}
