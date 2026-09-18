import os
import subprocess

def main():
    print("==================================================")
    print("   YT AUDIO NORMALIZER (Standar -14 LUFS)         ")
    print("==================================================")
    
    current_dir = os.getcwd()
    
    # Dapatkan daftar folder
    folders = [f for f in os.listdir(current_dir) if os.path.isdir(os.path.join(current_dir, f))]
    
    if not folders:
        print("Tidak ditemukan folder apapun di direktori ini.")
        return

    print("\nDaftar Folder yang tersedia:")
    for idx, folder in enumerate(folders):
        print(f"[{idx + 1}] {folder}")

    # Minta user memilih folder
    try:
        pilihan = int(input("\nMasukkan nomor folder yang ingin di-scan: "))
        if pilihan < 1 or pilihan > len(folders):
            print("Pilihan tidak valid.")
            return
    except ValueError:
        print("Harap masukkan angka yang valid.")
        return

    selected_folder = folders[pilihan - 1]
    folder_path = os.path.join(current_dir, selected_folder)
    print(f"\nMemindai folder: {selected_folder} ...")

    # Cari file audio dan ABAIKAN file yang sudah memiliki awalan 'ORI_' (file cadangan)
    audio_files = [f for f in os.listdir(folder_path) 
                   if f.lower().endswith(('.mp3', '.wav')) and not f.startswith('ORI_')]

    if not audio_files:
        print(f"Tidak ada file audio baru di dalam folder '{selected_folder}'.")
        return

    print(f"Ditemukan {len(audio_files)} file audio. Memulai normalisasi...\n")

    # Proses normalisasi
    for file_name in audio_files:
        print(f"Memproses: {file_name}")
        
        target_path = os.path.join(folder_path, file_name)
        backup_name = f"ORI_{file_name}"
        backup_path = os.path.join(folder_path, backup_name)
        
        # 1. Rename file asli menjadi file backup terlebih dahulu
        try:
            os.rename(target_path, backup_path)
        except OSError as e:
            print(f"  [ERROR] Gagal me-rename {file_name}. Lewati...\n")
            continue
        
        # 2. Perintah FFmpeg: input dari file backup, output ke nama target asli
        command = [
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-i', backup_path,
            '-af', 'loudnorm=I=-14:LRA=11:TP=-1.0',
            target_path
        ]
        
        try:
            subprocess.run(command, check=True)
            print(f"  -> Sukses! File telah dinormalisasi (Aslinya disimpan sbg: {backup_name})\n")
            
        except FileNotFoundError:
            print("  [ERROR] FFmpeg tidak ditemukan di sistem Anda!")
            print("  Pastikan Anda sudah menginstal FFmpeg dan memasukkannya ke PATH Windows.")
            # Kembalikan nama file seperti semula karena gagal diproses
            os.rename(backup_path, target_path)
            return 
            
        except subprocess.CalledProcessError as e:
            print(f"  [ERROR] Gagal memproses file ini. Mengembalikan file asli...\n")
            # Jika FFmpeg gagal dan file rusak/setengah jadi, hapus file rusak tersebut
            if os.path.exists(target_path):
                os.remove(target_path)
            # Kembalikan nama file asli
            os.rename(backup_path, target_path)

    print("==================================================")
    print("Semua file selesai diproses!")
    print("==================================================")

if __name__ == "__main__":
    main()