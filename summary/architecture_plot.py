from matplotlib.patches import FancyArrowPatch, FancyBboxPatch
import matplotlib.pyplot as plt


def add_box(ax, x, y, w, h, text, facecolor, edgecolor='#2A3F5F', fontsize=12):
    patch = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.02,rounding_size=0.08",
        linewidth=1.5,
        edgecolor=edgecolor,
        facecolor=facecolor,
    )
    ax.add_patch(patch)
    ax.text(
        x + w / 2,
        y + h / 2,
        text,
        ha='center',
        va='center',
        fontsize=fontsize,
        family='sans-serif',
        color='#0F172A',
    )
    return patch


def add_arrow(ax, x1, y1, x2, y2, label=None, label_offset=(0, 0)):
    arrow = FancyArrowPatch(
        (x1, y1), (x2, y2),
        arrowstyle='-|>',
        mutation_scale=16,
        linewidth=1.4,
        color='#3B4A5A',
    )
    ax.add_patch(arrow)
    if label:
        mx = (x1 + x2) / 2 + label_offset[0]
        my = (y1 + y2) / 2 + label_offset[1]
        ax.text(mx, my, label, fontsize=9, ha='center', va='center', color='#334155')


def draw_architecture(output_path='summary/end-to-end-architecture-plot.png'):
    fig, ax = plt.subplots(figsize=(18, 9))
    fig.patch.set_facecolor('#F8FAFC')
    ax.set_facecolor('#F8FAFC')
    ax.set_xlim(0, 18)
    ax.set_ylim(0, 10)
    ax.axis('off')

    # Boxes
    browser = add_box(ax, 0.7, 4.0, 2.1, 2.3, 'Browser\nUsers / Clients', '#E6F4FF')
    nginx = add_box(ax, 3.5, 4.7, 1.6, 1.2, 'NGINX\nIngress', '#E0F2FE')
    app1 = add_box(ax, 6.0, 6.2, 2.0, 1.3, 'App Node 1\nNext.js API', '#DCFCE7')
    app2 = add_box(ax, 6.0, 3.6, 2.0, 1.3, 'App Node 2\nNext.js API', '#DCFCE7')
    redis = add_box(ax, 9.1, 4.8, 1.7, 1.3, 'Redis\nPub/Sub + fan-out', '#FDE68A')
    primary = add_box(ax, 12.2, 6.7, 2.4, 1.4, 'MariaDB\nPrimary\nACID writes', '#DCFCE7')
    replica = add_box(ax, 12.2, 4.3, 2.4, 1.4, 'MariaDB\nReplica\nRead scale', '#E0F2FE')
    failover = add_box(ax, 12.2, 2.0, 2.4, 1.1, 'Failover\nWatcher\nPromote replica', '#FEE2E2')
    turn = add_box(ax, 3.6, 1.0, 2.2, 1.3, 'TURN\nCoturn\nNAT relay', '#FDE68A')
    media = add_box(ax, 6.5, 1.0, 2.2, 1.3, 'WebRTC\nAudio / Video', '#FEF3C7')
    auth = add_box(ax, 0.8, 1.0, 2.0, 1.1, 'Clerk\nAuth', '#F3E8FF')
    upload = add_box(ax, 9.3, 1.0, 2.0, 1.1, 'UploadThing\nFile storage', '#FCE7F3')

    # Browser to ingress and auth
    add_arrow(ax, 2.8, 5.2, 3.5, 5.3)
    add_arrow(ax, 1.8, 4.0, 1.8, 2.1)

    # Ingress to app nodes
    add_arrow(ax, 5.1, 5.3, 6.0, 6.8, 'HTTP / API')
    add_arrow(ax, 5.1, 5.1, 6.0, 4.3, 'HTTP / API')

    # App to Redis and DB
    add_arrow(ax, 8.0, 6.9, 9.1, 5.5, 'events / fan-out')
    add_arrow(ax, 8.0, 4.2, 9.1, 5.2, 'pub-sub / sync')
    add_arrow(ax, 8.0, 7.1, 12.2, 7.4, 'writes')
    add_arrow(ax, 8.0, 4.3, 12.2, 5.0, 'reads / reporting')
    add_arrow(ax, 12.2, 4.9, 12.2, 3.1, 'replica promotion')
    add_arrow(ax, 12.2, 2.6, 12.2, 3.1)

    # TURN and media
    add_arrow(ax, 2.8, 1.8, 3.6, 1.7, 'ICE / relay')
    add_arrow(ax, 5.8, 1.7, 6.5, 1.7)
    add_arrow(ax, 8.7, 1.7, 9.3, 1.7, 'uploads')

    # App to upload / file flow
    add_arrow(ax, 8.0, 3.9, 9.3, 1.7, 'encrypted file refs')

    # Browser to media and auth
    add_arrow(ax, 2.8, 4.2, 3.6, 1.8, 'WebRTC')
    add_arrow(ax, 2.8, 4.8, 0.8, 1.6, 'sign in / session')

    # Data layering note
    ax.text(
        10.2,
        0.45,
        'End-to-end architecture for SyncMove: browser -> NGINX -> app nodes -> Redis + MariaDB -> TURN/WebRTC -> external auth/storage',
        fontsize=10,
        color='#334155',
        ha='center',
        va='center',
    )

    plt.tight_layout()
    plt.savefig(output_path, dpi=220, bbox_inches='tight')
    plt.close(fig)

    print(f'Architecture diagram written to: {output_path}')


if __name__ == '__main__':
    draw_architecture()
