// Bullet.h: interface for the CBullet class.
//
//////////////////////////////////////////////////////////////////////

#if !defined(AFX_BULLET_H__24A0D4C0_8BAA_4227_92F4_455774AA2321__INCLUDED_)
#define AFX_BULLET_H__24A0D4C0_8BAA_4227_92F4_455774AA2321__INCLUDED_

#include "Weapon.h"

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000


class CBullet : public CWeapon  
{
private:
	int m_iOwner;
	float m_fBulletSpeed;
public:
	//main
	CBullet(const char*szname);
	virtual ~CBullet();
	void OnMove(int dir);
	//Get
	int GetOwner() {return m_iOwner;}
	float GetBulletSpeed() {return m_fBulletSpeed;}
	//Set
	void SetOwner(int owner) {m_iOwner = owner;}
	void SetBulletSpeed(float bulletspeed) {m_fBulletSpeed = bulletspeed;}
};

#endif // !defined(AFX_BULLET_H__24A0D4C0_8BAA_4227_92F4_455774AA2321__INCLUDED_)
