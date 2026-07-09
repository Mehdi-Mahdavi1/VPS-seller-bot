export function generateCloudInitScript(password: string): string {
  // Escape special characters for YAML/shell
  const escapedPassword = password.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");
  
  return `#cloud-config

disable_root: false
ssh_pwauth: true

chpasswd:
  expire: false
  users:
    - name: root
      password: '${escapedPassword}'
      type: text

packages:
  - openssh-server

runcmd:
  - sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
  - sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
  - sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
  - sleep 2
  - systemctl restart sshd || service ssh restart
  - sleep 1
`;
}

export function encodeCloudInitToBase64(script: string): string {
  return Buffer.from(script).toString("base64");
}

export function generateCloudInitBase64(password: string): string {
  const script = generateCloudInitScript(password);
  return encodeCloudInitToBase64(script);
}
